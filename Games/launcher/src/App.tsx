import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchGamesCatalog,
  type GameCatalogEntry,
  type GamesCatalog,
} from "@moongames/game-sdk";
import { FeaturedGame } from "./components/FeaturedGame";
import { GameCard } from "./components/GameCard";
import {
  defaultCatalogUrl,
  featuredGame,
  filterCatalog,
  type CatalogFilter,
} from "./lib/catalog";
import {
  currentLauncherWindow,
  hasLauncherBridge,
  launchCatalogGame,
} from "./lib/host";
import { applyTheme, initialTheme, type ThemeChoice } from "./lib/theme";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; catalog: GamesCatalog }
  | { phase: "error"; message: string };

const catalogUrl =
  import.meta.env.VITE_GAMES_CATALOG_URL ??
  defaultCatalogUrl(document.baseURI);

const filters: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "All games" },
  { id: "available", label: "Ready to play" },
  { id: "coming-soon", label: "Coming soon" },
  { id: "online", label: "Online" },
];

const fallbackOrbit = [
  { id: "chess", icon: "♞", accent: "#e5b85c" },
  { id: "cards", icon: "♠", accent: "#ff6b6b" },
  { id: "ludo", icon: "◈", accent: "#9b8cff" },
  { id: "carrom", icon: "◎", accent: "#48c9b0" },
];

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function App() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>(() => initialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    setState({ phase: "loading" });
    fetchGamesCatalog(catalogUrl)
      .then((catalog) => {
        if (active) {
          setState({ phase: "ready", catalog });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setState({
            phase: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "The games catalog could not be loaded.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const catalog = state.phase === "ready" ? state.catalog : null;
  const games = catalog?.games ?? [];
  const visibleGames = useMemo(
    () => filterCatalog(games, filter, query),
    [games, filter, query],
  );
  const featured = useMemo(
    () => featuredGame(visibleGames),
    [visibleGames],
  );
  const gridGames = featured
    ? visibleGames.filter((game) => game.id !== featured.id)
    : visibleGames;
  const availableCount = games.filter(
    (game) => game.status === "available",
  ).length;
  const comingSoonCount = games.filter(
    (game) => game.status === "coming-soon",
  ).length;
  const onlineCount = games.filter((game) =>
    game.capabilities.includes("online"),
  ).length;
  const orbitGames =
    games.length === 0
      ? fallbackOrbit
      : games.slice(0, 4).map((game) => ({
          id: game.id,
          icon: game.icon,
          accent: game.accent,
        }));
  const nativeLaunch = useMemo(
    () => hasLauncherBridge(currentLauncherWindow()),
    [],
  );

  const playGame = useCallback(
    (game: GameCatalogEntry, url: string | null) => {
      launchCatalogGame(game.id, url, currentLauncherWindow());
    },
    [],
  );

  const clearFilters = () => {
    setFilter("all");
    setQuery("");
  };

  return (
    <div className="site-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="MoonGames home">
          <span className="brand__mark" aria-hidden="true">
            ☾
          </span>
          <span className="brand__copy">
            <strong>MoonGames</strong>
            <small>one library, every table</small>
          </span>
        </a>
        <nav className="topbar__nav" aria-label="Main navigation">
          <a href="#library">Library</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <span className="eyebrow">
              <span className="eyebrow__spark" aria-hidden="true" />
              One library. Every table.
            </span>
            <h1>
              Pick a game.
              <span>We&apos;ll bring the table.</span>
            </h1>
            <p className="hero__lede">
              Chess tonight, cards with friends tomorrow. MoonGames keeps every
              game, account, and invite in one calm place — on the web, Flutter,
              or React Native.
            </p>
            <div className="hero__actions">
              <a className="button button--primary" href="#library">
                Browse the library <span aria-hidden="true">↓</span>
              </a>
              <span className="hero__note">
                <span className="status-dot" aria-hidden="true" />
                {state.phase === "error"
                  ? "Library unavailable"
                  : availableCount > 0
                    ? `${availableCount} table${availableCount === 1 ? "" : "s"} open now`
                    : "Loading the library"}
              </span>
            </div>
            <dl className="hero__stats">
              <div>
                <dt>Ready</dt>
                <dd>{catalog === null ? "—" : availableCount}</dd>
              </div>
              <div>
                <dt>In the works</dt>
                <dd>{catalog === null ? "—" : comingSoonCount}</dd>
              </div>
              <div>
                <dt>Online-ready</dt>
                <dd>{catalog === null ? "—" : onlineCount}</dd>
              </div>
            </dl>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="hero-orbit">
              <span className="hero-orbit__ring hero-orbit__ring--one" />
              <span className="hero-orbit__ring hero-orbit__ring--two" />
              <span className="hero-orbit__ring hero-orbit__ring--three" />
              {orbitGames.map((game, index) => (
                <span
                  className={`orbit-token orbit-token--${index + 1}`}
                  style={{ "--accent": game.accent } as CSSProperties}
                  key={game.id}
                >
                  {game.icon}
                </span>
              ))}
              <span className="orbit-center">
                <span className="orbit-center__moon">☾</span>
                <small>MOON<br />GAMES</small>
              </span>
            </div>
            <p className="hero__visual-caption">
              A single account. A growing collection.
            </p>
          </div>
        </section>

        <section className="library" id="library" aria-labelledby="library-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The library</span>
              <h2 id="library-title">Choose your table</h2>
              <p>
                Every game shares the same account, profile, and invite system.
                Pick a mood and settle in.
              </p>
            </div>
            <label className="search">
              <span className="search__icon" aria-hidden="true">
                ⌕
              </span>
              <span className="visually-hidden">Search games</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search games"
              />
            </label>
          </div>

          <div className="filter-row" aria-label="Filter games">
            {filters.map((item) => {
              const count =
                item.id === "all"
                  ? games.length
                  : item.id === "online"
                    ? onlineCount
                    : games.filter((game) => game.status === item.id).length;
              return (
                <button
                  className={`filter-chip${filter === item.id ? " filter-chip--active" : ""}`}
                  type="button"
                  aria-pressed={filter === item.id}
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span>{catalog === null ? "·" : count}</span>
                </button>
              );
            })}
          </div>

          {state.phase === "loading" ? <LoadingLibrary /> : null}

          {state.phase === "error" ? (
            <div className="empty-panel" role="alert">
              <span className="empty-panel__icon" aria-hidden="true">
                ☾
              </span>
              <h3>The library is taking a moment.</h3>
              <p>{state.message}</p>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          ) : null}

          {state.phase === "ready" ? (
            <>
              {featured === null ? null : (
                <FeaturedGame
                  game={featured}
                  catalogUrl={catalogUrl}
                  nativeLaunch={nativeLaunch}
                  onPlay={playGame}
                />
              )}

              {gridGames.length > 0 ? (
                <div className="game-grid">
                  {gridGames.map((game: GameCatalogEntry) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      catalogUrl={catalogUrl}
                      nativeLaunch={nativeLaunch}
                      onPlay={playGame}
                    />
                  ))}
                </div>
              ) : null}

              {visibleGames.length === 0 ? (
                <div className="empty-panel">
                  <span className="empty-panel__icon" aria-hidden="true">
                    ⌕
                  </span>
                  <h3>No tables match that search.</h3>
                  <p>
                    Try another game name, or clear the filters to see the whole
                    library.
                  </p>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="how-it-works" id="how-it-works">
          <div className="section-heading section-heading--compact">
            <div>
              <span className="eyebrow">Built once, played anywhere</span>
              <h2>One account. No sideways setup.</h2>
            </div>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-card__icon" aria-hidden="true">
                ◇
              </span>
              <h3>One identity</h3>
              <p>
                Your MoonGames profile, rating, and history follow you from the
                browser into Flutter and React Native.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon" aria-hidden="true">
                ⚡
              </span>
              <h3>Signed updates</h3>
              <p>
                Games arrive as signed, verified bundles with a local fallback,
                so the table stays available when the network does not.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon" aria-hidden="true">
                ◎
              </span>
              <h3>One invite</h3>
              <p>
                Share a link, open a private room, or jump into a rated match.
                Hosts can use this menu or build their own.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span className="footer__brand">
          <span aria-hidden="true">☾</span> MoonGames
        </span>
        <span>
          {catalog === null
            ? "Games catalog v1"
            : `Catalog updated ${formatUpdatedAt(catalog.generatedAt)} · ${catalog.games.length} games`}
        </span>
        <span>Web · Flutter · React Native</span>
      </footer>
    </div>
  );
}

function LoadingLibrary() {
  return (
    <div className="loading-library" aria-label="Loading games">
      <div className="loading-feature">
        <span />
        <span />
        <span />
      </div>
      <div className="game-grid">
        {[0, 1, 2].map((item) => (
          <div className="loading-card" key={item}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
