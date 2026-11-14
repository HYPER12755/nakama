import type { ReactNode } from "react";

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export interface GameToolbarProps {
  actions: ToolbarAction[];
  title?: string;
}

/** The action grid every game shows under the board. */
export function GameToolbar({ actions, title = "Actions" }: GameToolbarProps) {
  return (
    <section className="panel toolbar-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="toolbar-grid">
        {actions.map((action) => (
          <button
            type="button"
            className="action-button"
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled === true}
            title={action.title}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
