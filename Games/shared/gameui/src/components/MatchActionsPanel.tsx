import type { ReactNode } from "react";

export interface MatchActionItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
  icon?: ReactNode;
  title?: string;
}

export interface MatchActionsPanelProps {
  title?: string;
  kicker?: string;
  badge?: ReactNode;
  actions: MatchActionItem[];
  footer?: ReactNode;
}

/**
 * The match action panel shared by Chess and Ludo: a titled panel, a grid of
 * explicit actions, and optional quiet footer actions like Leave.
 */
export function MatchActionsPanel({
  title = "Match actions",
  kicker = "Table",
  badge,
  actions,
  footer,
}: MatchActionsPanelProps) {
  return (
    <section className="panel toolbar-panel">
      <div className="panel-heading">
        <div>
          {kicker ? <p className="eyebrow">{kicker}</p> : null}
          <h2>{title}</h2>
        </div>
        {badge ?? null}
      </div>
      <div className="toolbar-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={[
              "action-button",
              action.danger ? "action-button--danger" : "",
              action.accent ? "action-button--accent" : "",
            ].filter(Boolean).join(" ")}
            onClick={action.onClick}
            disabled={action.disabled === true}
            title={action.title}
          >
            {action.icon ?? null}
            {action.label}
          </button>
        ))}
      </div>
      {footer ?? null}
    </section>
  );
}
