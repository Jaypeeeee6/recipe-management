"""App Portal SSO + sync for Recipe Lab."""

from __future__ import annotations

import json
import os
import secrets
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.http import HttpResponseRedirect, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Role, UserProfile

User = get_user_model()


def _portal_url():
    return (os.environ.get('PORTAL_URL') or 'http://localhost:5050').rstrip('/')


def _frontend_url():
    return (os.environ.get('RECIPE_FRONTEND_URL') or 'http://localhost:5173').rstrip('/')


def _sso_secret():
    return (os.environ.get('SSO_SECRET') or '').strip()


def _sync_secret():
    return (os.environ.get('PORTAL_SYNC_SECRET') or '').strip()


def _auth_ok(request):
    expected = _sync_secret()
    if not expected:
        return False, JsonResponse({'error': 'PORTAL_SYNC_SECRET not configured'}, status=503)
    auth = request.headers.get('Authorization') or ''
    token = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
    if not token or token != expected:
        return False, JsonResponse({'error': 'Unauthorized'}, status=401)
    return True, None


def upsert_recipe_user(email: str, name: str, role: str, active: bool = True):
    email_n = (email or '').strip().lower()
    if not email_n or '@' not in email_n:
        raise ValueError('Valid email required')
    role_n = (role or Role.STAFF).strip()
    if role_n not in {c.value for c in Role}:
        raise ValueError(f'Invalid role: {role_n}')
    display = (name or email_n.split('@')[0]).strip()

    user = User.objects.filter(email__iexact=email_n).first()
    if not user:
        user = User.objects.filter(username__iexact=email_n).first()
    if user:
        user.email = email_n
        user.username = email_n
        user.is_active = bool(active)
        user.save()
    else:
        user = User.objects.create_user(
            username=email_n,
            email=email_n,
            password=secrets.token_urlsafe(32),
            is_active=bool(active),
        )

    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={'display_name': display, 'role': role_n},
    )
    profile.display_name = display
    profile.role = role_n
    profile.save()
    return user


@require_GET
def sso_consume(request):
    token = (request.GET.get('token') or '').strip()
    if not token:
        return HttpResponseRedirect(_portal_url() + '/login')
    secret = _sso_secret()
    if not secret:
        return HttpResponseRedirect(_portal_url() + '/login')
    try:
        data = URLSafeTimedSerializer(secret, salt='maa-app-portal-sso').loads(token, max_age=120)
    except (SignatureExpired, BadSignature):
        return HttpResponseRedirect(_portal_url() + '/login')
    if not isinstance(data, dict) or (data.get('app') and data.get('app') != 'recipe'):
        return HttpResponseRedirect(_portal_url() + '/login')
    email = (data.get('email') or '').strip().lower()
    name = (data.get('name') or '').strip()
    role = (data.get('role') or '').strip()
    if not email or not role:
        return HttpResponseRedirect(_portal_url() + '/login')
    try:
        user = upsert_recipe_user(email, name, role, active=True)
    except Exception:
        return HttpResponseRedirect(_portal_url() + '/login')
    if not user.is_active:
        return HttpResponseRedirect(_portal_url() + '/login')

    refresh = RefreshToken.for_user(user)
    qs = urlencode(
        {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'sso': '1',
        }
    )
    return HttpResponseRedirect(f'{_frontend_url()}/sso-callback?{qs}')


@csrf_exempt
@require_POST
def portal_upsert(request):
    ok, err = _auth_ok(request)
    if not ok:
        return err
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        payload = {}
    try:
        user = upsert_recipe_user(
            payload.get('email'),
            payload.get('name'),
            payload.get('role'),
            active=bool(payload.get('active', True)),
        )
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)
    return JsonResponse({'ok': True, 'user_id': user.id})


@csrf_exempt
@require_POST
def portal_revoke(request):
    ok, err = _auth_ok(request)
    if not ok:
        return err
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        payload = {}
    email = (payload.get('email') or '').strip().lower()
    User.objects.filter(email__iexact=email).update(is_active=False)
    return JsonResponse({'ok': True})
