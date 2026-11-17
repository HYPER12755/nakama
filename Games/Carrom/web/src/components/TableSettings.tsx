import {
  CARROM_CLOCKS,
  CARROM_STRIKERS,
  CARROM_VARIANTS,
  PLAYER_LABEL,
  type CarromPlayer,
  type GameVariant,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

export interface TableSettingsProps {
  /** The table sizes the game can be played at. */
  tableSizes: readonly number[];
  tableSize: number;
  onTableSizeChange: (size: number) => void;
  /** Whether the table size can still be changed. */
  tableSizeLocked?: boolean;
  variant: GameVariant;
  onVariantChange: (variant: GameVariant) => void;
  /** The game types offered here. */
  variants?: GameVariant[];
  striker: string;
  onStrikerChange: (id: string) => void;
  turnSeconds: number;
  onTurnSecondsChange: (seconds: number) => void;
  /** Whether the table settings are locked, for example while a table runs. */
  locked?: boolean;
  /** The seats that can be handed to the computer in a local game. */
  computerSeats?: CarromPlayer[];
  /** The seats the computer is playing in a local game. */
  computerPlayers?: CarromPlayer[];
  onComputerPlayersChange?: (seats: CarromPlayer[]) => void;
  /** Whether partners share the pieces in a four player table. */
  teams?: boolean;
  onTeamsChange?: (teams: boolean) => void;
}

/**
 * The table settings: the size of the table, the game type, the striker and
 * the shot clock. They live with the table in the sidebar rather than under
 * the board, so the board only carries the controls for the shot in play.
 */
export function TableSettings({
  tableSizes,
  tableSize,
  onTableSizeChange,
  tableSizeLocked = false,
  variant,
  onVariantChange,
  variants,
  striker,
  onStrikerChange,
  turnSeconds,
  onTurnSecondsChange,
  locked = false,
  computerSeats,
  computerPlayers = [],
  onComputerPlayersChange,
  teams = false,
  onTeamsChange,
}: TableSettingsProps) {
  const offered = variants ?? (Object.keys(CARROM_VARIANTS) as GameVariant[]);
  const skin = CARROM_STRIKERS.find((entry) => entry.id === striker);

  return (
    <section className="panel table-settings">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Table setup</p>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="setting">
        <span className="setting__label">Players</span>
        <div className="setting__options" role="radiogroup" aria-label="Table size">
          {tableSizes.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={tableSize === size}
              className={`setting__option${
                tableSize === size ? " setting__option--active" : ""
              }`}
              onClick={() => onTableSizeChange(size)}
              disabled={locked || tableSizeLocked}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {computerSeats !== undefined && onComputerPlayersChange !== undefined ? (
        <div className="setting">
          <span className="setting__label">Computer</span>
          <div className="setting__options" role="group" aria-label="Computer seats">
            {computerSeats.map((seat) => {
              const computer = computerPlayers.includes(seat);
              return (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={computer}
                  className={`setting__option setting__option--wide${
                    computer ? " setting__option--active" : ""
                  }`}
                  disabled={locked}
                  onClick={() =>
                    onComputerPlayersChange(
                      computer
                        ? computerPlayers.filter((entry) => entry !== seat)
                        : [...computerPlayers, seat],
                    )
                  }
                >
                  {computer ? "CPU" : ""} {PLAYER_LABEL[seat]}
                </button>
              );
            })}
          </div>
          <p className="setting__note">
            Any seat can be played by the computer. A seat left to a player
            passes the device around the table.
          </p>
        </div>
      ) : null}

      {onTeamsChange !== undefined && tableSize === 4 ? (
        <div className="setting">
          <span className="setting__label">Sides</span>
          <div className="setting__options" role="radiogroup" aria-label="Teams">
            <button
              type="button"
              role="radio"
              aria-checked={!teams}
              className={`setting__option setting__option--wide${
                !teams ? " setting__option--active" : ""
              }`}
              disabled={locked}
              onClick={() => onTeamsChange(false)}
            >
              Everyone for themselves
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={teams}
              className={`setting__option setting__option--wide${
                teams ? " setting__option--active" : ""
              }`}
              disabled={locked}
              onClick={() => onTeamsChange(true)}
            >
              Two against two
            </button>
          </div>
          <p className="setting__note">
            Partners sit opposite, share their pieces and the queen, and take
            the turn in turn.
          </p>
        </div>
      ) : null}

      <div className="setting">
        <span className="setting__label">Game</span>
        <div className="setting__options" role="radiogroup" aria-label="Game type">
          {offered.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={variant === id}
              className={`setting__option setting__option--wide${
                variant === id ? " setting__option--active" : ""
              }`}
              onClick={() => onVariantChange(id)}
              disabled={locked}
            >
              {CARROM_VARIANTS[id].label}
            </button>
          ))}
        </div>
        <p className="setting__note">
          {variant === "classic"
            ? "The ICF game: fouls cost a piece and the queen must be covered."
            : variant === "freestyle"
              ? "Fouls still count, but the queen is an ordinary piece."
              : "No fouls and no penalties. A table to practise on."}
        </p>
      </div>

      <div className="setting">
        <span className="setting__label">Striker</span>
        <div className="setting__options" role="radiogroup" aria-label="Striker">
          {CARROM_STRIKERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={striker === entry.id}
              className={`setting__option setting__option--wide${
                striker === entry.id ? " setting__option--active" : ""
              }`}
              onClick={() => onStrikerChange(entry.id)}
              disabled={locked}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="setting__note">
          <Icon name="target" size={13} />
          {skin?.note ?? "The standard striker."}
        </p>
      </div>

      <div className="setting">
        <span className="setting__label">Shot clock</span>
        <div
          className="setting__options"
          role="radiogroup"
          aria-label="Shot clock"
        >
          {CARROM_CLOCKS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={turnSeconds === seconds}
              className={`setting__option${
                turnSeconds === seconds ? " setting__option--active" : ""
              }`}
              onClick={() => onTurnSecondsChange(seconds)}
              disabled={locked}
            >
              {seconds === 0 ? "Off" : `${seconds}s`}
            </button>
          ))}
        </div>
        <p className="setting__note">
          {turnSeconds === 0
            ? "No clock. Take as long as you like."
            : "A player who runs out of time loses the turn."}
        </p>
      </div>
    </section>
  );
}
