import { useContext } from "react";
import { RoleContext, type RoleContextValue } from "./roleContext";

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}
