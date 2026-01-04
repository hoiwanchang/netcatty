import * as React from "react";

import { Switch, type SwitchProps } from "./switch";

export interface ToggleProps extends Omit<SwitchProps, "onCheckedChange"> {
  onChange?: (checked: boolean) => void;
}

export const Toggle = React.forwardRef<HTMLInputElement, ToggleProps>(
  ({ onChange, ...props }, ref) => {
    return <Switch ref={ref} onCheckedChange={onChange} {...props} />;
  },
);

Toggle.displayName = "Toggle";
