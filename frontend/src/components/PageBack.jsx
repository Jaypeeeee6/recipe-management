import { Link } from "react-router-dom";
import Icon from "./Icon";

/** Navigation Back control, always rendered above the page header. */
export default function PageBack({ to, state }) {
  return (
    <div className="page-back">
      <Link className="btn btn-back" to={to} state={state}>
        <Icon name="back" />
        Back
      </Link>
    </div>
  );
}
