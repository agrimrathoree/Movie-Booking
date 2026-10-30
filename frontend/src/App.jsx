import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api, clearCsrfToken, imageFor, socketUrl } from "./api.js";
import { previewMovies } from "./catalog.js";
import "./App.css";

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const money = (amount) => "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const showDate = (value) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api("/auth/me").then((data) => { if (active) setUser(data.user); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({
    user,
    loading,
    async login(payload) { const data = await api("/auth/login", { method: "POST", body: payload }); setUser(data.user); return data.user; },
    async register(payload) { const data = await api("/auth/register", { method: "POST", body: payload }); setUser(data.user); return data.user; },
    async logout() { await api("/auth/logout", { method: "POST", body: {} }); clearCsrfToken(); setUser(null); },
    setUser,
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Shell() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); }, [location.pathname]);
  const signOut = async () => {
    try { await logout(); setNotice("You are signed out."); }
    catch (error) { setNotice(error.message); }
    window.setTimeout(() => setNotice(""), 3200);
  };
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="iMovies home"><span className="brand-mark">i</span><span>movies</span></Link>
        <button className="mobile-menu" type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "×" : "☰"}</button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <Link to="/">Home</Link><Link to="/movies">Movies</Link>
          {user && <><Link to="/bookings">My tickets</Link><Link to="/favorites">Watchlist</Link><Link to="/profile">Profile</Link></>}
          {!user && !loading && <Link to="/login">Sign in</Link>}
          {user && <button className="nav-signout" onClick={signOut}>Sign out</button>}
        </nav>
      </header>
      {notice && <div className="toast-note" role="status">{notice}</div>}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/movies/:id" element={<MoviePage />} />
        <Route path="/movie/:id" element={<MoviePage />} />
        <Route path="/shows/:showId/seats" element={<SeatPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/checkout/return" element={<CheckoutReturn />} />
        <Route path="/bookings" element={<PrivateRoute><BookingsPage /></PrivateRoute>} />
        <Route path="/favorites" element={<PrivateRoute><FavoritesPage /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer className="footer">
        <div><Link className="brand footer-brand" to="/"><span className="brand-mark">i</span><span>movies</span></Link><p>Make a night of it.</p></div>
        <div className="footer-links"><Link to="/movies">Browse films</Link><Link to="/bookings">Your tickets</Link><Link to="/favorites">Watchlist</Link></div>
        <span className="muted">© {new Date().getFullYear()} iMovies</span>
      </footer>
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session" />;
  if (!user) return <Navigate to={"/login?next=" + encodeURIComponent(location.pathname + location.search)} replace />;
  return children;
}

function Loading({ label = "Loading" }) {
  return <div className="status-panel"><span className="spinner" />{label}…</div>;
}

function ErrorPanel({ message, retry }) {
  return <div className="error-panel" role="alert"><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Try again</button>}</div>;
}

function Poster({ movie, className = "" }) {
  return <img className={className} src={imageFor(movie)} alt={movie.movieName + " poster"} loading="lazy" onError={(event) => { event.currentTarget.src = imageFor({ poster: "FM1.png" }); }} />;
}

function useMovies(query = "", language = "") {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "60" });
    if (query) params.set("search", query);
    if (language) params.set("language", language);
    api("/movies?" + params.toString()).then((data) => {
      if (active) { setMovies(data.items || []); setOffline(false); }
    }).catch((problem) => {
      if (active) {
        const needle = query.toLowerCase();
        const local = previewMovies.filter((movie) => (!needle || (movie.movieName + " " + movie.categories.join(" ") + " " + movie.language).toLowerCase().includes(needle)) && (!language || movie.language.toLowerCase() === language.toLowerCase()));
        setMovies(local); setOffline(true); setError(problem.message);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, language]);
  return { movies, loading, error, offline };
}

function MovieCard({ movie }) {
  return (
    <Link className="movie-card" to={"/movies/" + movie._id}>
      <div className="poster-wrap"><Poster movie={movie} className="movie-poster" /><span className="poster-rating">★ {Number(movie.rating || 0).toFixed(1)}</span><span className="poster-cta">View film <span>↗</span></span></div>
      <div className="movie-card-info"><div className="movie-title-row"><h3>{movie.movieName}</h3><span>{movie.year || "—"}</span></div><p>{(movie.categories || []).slice(0, 2).join(" · ") || movie.language || "Film"}</p></div>
    </Link>
  );
}

function MovieGrid({ movies }) {
  if (!movies.length) return <div className="empty-panel"><span className="empty-icon">✦</span><h3>No films found</h3><p>Try a different search or remove some filters.</p></div>;
  return <div className="movie-grid">{movies.map((movie) => <MovieCard key={movie._id} movie={movie} />)}</div>;
}

function HomePage() {
  const { movies, loading, error, offline } = useMovies("");
  const featured = movies.find((movie) => movie.type === "featured") || movies[0];
  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" />THE BIG SCREEN, YOUR WAY</span><h1>Stories are better<br /><em>in the dark.</em></h1><p>Find your next favorite film, pick your seats, and let the lights go down.</p><div className="hero-actions"><Link className="button button-primary" to="/movies">Explore films <span>↗</span></Link><Link className="button button-quiet" to="/movies">See what's playing</Link></div><div className="hero-proof"><span className="proof-avatars"><i>✦</i><i>◉</i><i>✺</i></span><span>Big screen nights start here</span></div></div>
        <div className="hero-art">
          {featured && <Poster movie={featured} className="hero-poster" />}
          <div className="hero-art-overlay" />
          <div className="hero-film-caption"><span>NOW SHOWING</span><strong>{featured?.movieName || "Your next movie night"}</strong><span>{featured ? (featured.categories || []).join(" · ") : "Find something unforgettable"}</span></div>
          <div className="hero-ticket"><span>★</span><span>YOUR<br />NEXT<br />SCENE</span></div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        </div>
        <div className="hero-index"><span>01</span><i /><span>06</span></div>
      </section>
      {offline && <div className="inline-banner"><strong>Preview catalog</strong><span>Connect the backend and seed MongoDB to see live movies and book shows. {error}</span></div>}
      <section className="section-block"><div className="section-heading"><div><span className="eyebrow">THE CURRENT LINEUP</span><h2>Playing now<span className="heading-dot">.</span></h2></div><Link className="section-link" to="/movies">All movies <span>↗</span></Link></div>{loading ? <Loading label="Finding films" /> : <MovieGrid movies={movies.slice(0, 4)} />}</section>
      <section className="experience-band"><div><span className="eyebrow">A BETTER KIND OF MOVIE NIGHT</span><h2>Less scrolling.<br /><em>More cinema.</em></h2></div><div className="experience-detail"><span className="experience-number">01 — 03</span><p>Browse the lineup, choose a screening, and make every seat yours. Your tickets stay together in one place.</p><Link to="/movies" className="button button-outline">Find a screening <span>↗</span></Link></div><div className="experience-stamp">PLAY<br />IT<br /><b>BIG</b></div></section>
    </main>
  );
}

function MoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") || "";
  const genre = searchParams.get("genre") || "All";
  const language = searchParams.get("language") || "All";
  const { movies, loading, error, offline } = useMovies(search, language === "All" ? "" : language);
  const genres = ["All", ...new Set(movies.flatMap((movie) => movie.categories || []))];
  const languages = ["All", ...new Set([...movies.map((movie) => movie.language), "Hindi", "English", "Kannada", "Tamil", "Telugu", "Malayalam"].filter(Boolean))];
  const visible = genre === "All" ? movies : movies.filter((movie) => (movie.categories || []).some((item) => item.toLowerCase() === genre.toLowerCase()));
  return <main className="page-content catalog-page">
    <div className="page-kicker"><span className="eyebrow">THE iMOVIES COLLECTION</span><span>01 / FILMS</span></div>
    <div className="catalog-title"><div><h1>Find your <em>next film.</em></h1><p>Big stories. Great seats. One easy booking.</p></div><label className="search-box"><span>⌕</span><input aria-label="Search movies" placeholder="Search titles, genres, language…" value={search} onChange={(event) => { const value = event.target.value; setSearchParams({ ...(value ? { search: value } : {}), ...(genre !== "All" ? { genre } : {}), ...(language !== "All" ? { language } : {}) }); }} /><kbd>⌘ K</kbd></label></div>
    <div className="filter-row">{genres.map((item) => <button key={item} className={genre === item ? "filter-chip active" : "filter-chip"} onClick={() => setSearchParams({ ...(search ? { search } : {}), ...(item !== "All" ? { genre: item } : {}), ...(language !== "All" ? { language } : {}) })}>{item}</button>)}<label className="language-filter"><span>Language</span><select value={language} onChange={(event) => setSearchParams({ ...(search ? { search } : {}), ...(genre !== "All" ? { genre } : {}), ...(event.target.value !== "All" ? { language: event.target.value } : {}) })}>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
    {offline && <div className="inline-banner"><strong>Preview catalog</strong><span>Movie results are local previews. Live screening times require a connected backend.</span></div>}
    {error && !offline && <ErrorPanel message={error} />}
    {loading ? <Loading label="Loading movies" /> : <><MovieGrid movies={visible} /><p className="catalog-count">Showing {visible.length} film{visible.length === 1 ? "" : "s"}</p></>}
  </main>;
}

function MoviePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    if (String(id).startsWith("preview-")) {
      const localMovie = previewMovies.find((item) => item._id === id);
      setMovie(localMovie || null); setShows([]); setOffline(true); setLoading(false);
      return () => { active = false; };
    }
    setMovie(null);
    setLoading(true);
    Promise.all([api("/movies/" + id), api("/shows?movieId=" + encodeURIComponent(id))]).then(([movieData, showData]) => {
      if (active) { setMovie(movieData.movie); setShows(showData.items || []); setOffline(false); }
    }).catch((problem) => { if (active) setError(problem.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!user || String(id).startsWith("preview-")) { setSaved(false); return; }
    api("/users/me/favorites").then((data) => setSaved((data.items || []).some((item) => String(item._id) === String(id)))).catch(() => {});
  }, [id, user]);
  if (loading) return <main className="page-content"><Loading label="Loading film" /></main>;
  if (!movie) return <main className="page-content"><ErrorPanel message={error || "Movie not found."} /><Link className="button button-primary" to="/movies">Back to movies</Link></main>;
  const toggleSaved = async () => {
    if (!user) { navigate("/login?next=" + encodeURIComponent(window.location.pathname)); return; }
    try {
      if (saved) await api("/users/me/favorites/" + id, { method: "DELETE" });
      else await api("/users/me/favorites/" + id, { method: "PUT", body: {} });
      setSaved(!saved);
    } catch (problem) { setError(problem.message); }
  };
  return <main className="page-content movie-detail-page">
    <Link className="back-link" to="/movies">← All films</Link>
    <div className="detail-layout"><div className="detail-poster"><Poster movie={movie} /></div><div className="detail-copy">
      <div className="page-kicker"><span className="eyebrow">{(movie.categories || []).join(" · ") || "FEATURE FILM"}</span><button className={saved ? "save-button saved" : "save-button"} onClick={toggleSaved}>{saved ? "♥ Saved" : "♡ Add to watchlist"}</button></div>
      <h1>{movie.movieName}</h1><div className="film-meta"><span>★ {Number(movie.rating || 0).toFixed(1)}</span><span>{movie.year || "—"}</span><span>{movie.language || "Language TBA"}</span><span>{movie.duration ? Math.floor(movie.duration / 60) + "h " + (movie.duration % 60) + "m" : "Runtime TBA"}</span></div>
      <p className="movie-description">{movie.description || movie.story || "More details will be available soon."}</p>
      <div className="show-list-heading"><div><span className="eyebrow">CHOOSE A SCREENING</span><h2>Showtimes</h2></div><span className="show-date-note">Upcoming</span></div>
      {offline ? <div className="empty-panel"><h3>Live screenings are not connected</h3><p>Connect the API and seed the database to see showtimes and book seats. This preview film cannot be booked.</p></div> : shows.length ? <div className="show-list">{shows.map((show) => <Link className="show-row" key={show._id} to={"/shows/" + show._id + "/seats"}><div><strong>{showDate(show.startsAt)}</strong><span>{show.theaterId?.name} · {show.theaterId?.city} · {show.auditorium}</span></div><span className="show-price">from {money(show.seatPrices?.standard)}</span><span className="show-arrow">↗</span></Link>)}</div> : <div className="empty-panel"><h3>No upcoming screenings</h3><p>Check back soon for a new showtime.</p></div>}
      {error && <ErrorPanel message={error} />}
    </div></div>
  </main>;
}

function SeatPage() {
  const { showId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const data = await api("/shows/" + showId + "/seats");
    setShow(data.show); setSeats(data.seats || []);
    setSelected((current) => current.filter((id) => (data.seats || []).some((seat) => seat.seatId === id && seat.state === "available")));
  }, [showId]);
  useEffect(() => {
    let active = true;
    api("/shows/" + showId + "/seats").then((data) => { if (active) { setShow(data.show); setSeats(data.seats || []); } }).catch((problem) => { if (active) setError(problem.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showId]);
  useEffect(() => {
    if (!user) return undefined;
    const socket = io(socketUrl, { withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("show:join", showId));
    socket.on("seats:changed", (event) => { if (String(event.showId) === String(showId)) refresh().catch(() => {}); });
    const poll = window.setInterval(() => refresh().catch(() => {}), 15000);
    return () => { window.clearInterval(poll); socket.emit("show:leave", showId); socket.disconnect(); };
  }, [showId, user, refresh]);
  if (loading) return <main className="page-content"><Loading label="Loading seat map" /></main>;
  if (!show) return <main className="page-content"><ErrorPanel message={error || "Show not found."} /><Link to="/movies" className="button button-primary">Browse films</Link></main>;
  const seatById = new Map(seats.map((seat) => [seat.seatId, seat]));
  const total = selected.reduce((sum, id) => sum + Number(seatById.get(id)?.price || 0), 0);
  const toggleSeat = (seat) => {
    if (seat.state !== "available") return;
    setSelected((current) => current.includes(seat.seatId) ? current.filter((id) => id !== seat.seatId) : current.length < 10 ? [...current, seat.seatId] : current);
  };
  const startCheckout = async () => {
    if (!selected.length) return;
    if (!user) { navigate("/login?next=" + encodeURIComponent(window.location.pathname)); return; }
    setSubmitting(true); setError("");
    let bookingId = "";
    try {
      const hold = await api("/bookings/lock-seats", { method: "POST", body: { showId, seatIds: selected } });
      bookingId = hold.booking.id;
      const order = await api("/payments/create-order", { method: "POST", body: { bookingId } });
      window.location.assign(order.checkout.url);
    } catch (problem) {
      if (bookingId) await api("/bookings/" + bookingId + "/lock", { method: "DELETE" }).catch(() => {});
      setError(problem.message); await refresh().catch(() => {});
    } finally { setSubmitting(false); }
  };
  return <main className="page-content seat-page">
    <Link className="back-link" to={"/movies/" + show.movie?._id}>← Back to film</Link>
    <div className="seat-page-heading"><div><span className="eyebrow">PICK YOUR SPOT</span><h1>{show.movie?.movieName}</h1><p>{showDate(show.startsAt)} <span>·</span> {show.theater?.name}, {show.theater?.city} <span>·</span> {show.auditorium}</p></div><div className="seat-legend"><span><i className="legend-dot available" />Available</span><span><i className="legend-dot selected" />Selected</span><span><i className="legend-dot locked" />Temporarily held</span><span><i className="legend-dot booked" />Booked</span></div></div>
    <div className="screen-arc"><span>SCREEN</span></div>
    <section className="seat-layout" aria-label="Seat selection">
      {[...new Set(seats.map((seat) => seat.seatId.match(/^[A-Z]+/)?.[0]).filter(Boolean))].map((row) => <div className="seat-row" key={row}><span className="row-label">{row}</span><div className="seat-row-buttons">{seats.filter((seat) => seat.seatId.startsWith(row)).map((seat) => {
        const active = selected.includes(seat.seatId);
        return <button type="button" key={seat.seatId} disabled={seat.state !== "available"} aria-pressed={active} title={seat.seatId + " · " + seat.type + " · " + money(seat.price) + " · " + (active ? "selected" : seat.state)} className={"seat-button seat-" + (active ? "selected" : seat.state)} onClick={() => toggleSeat(seat)}>{seat.seatId.slice(row.length)}</button>;
      })}</div><span className="row-label">{row}</span></div>)}
    </section>
    <div className="seat-summary"><div><span className="eyebrow">YOUR SEATS</span><strong>{selected.length ? selected.slice().sort().join(", ") : "Choose up to 10 seats"}</strong></div><div><span className="eyebrow">TOTAL · SERVER PRICED</span><strong>{money(total)}</strong></div><button className="button button-primary" disabled={!selected.length || submitting} onClick={startCheckout}>{submitting ? "Securing seats…" : "Continue to payment ↗"}</button></div>
    {!user && <p className="form-hint">Sign in is required to hold seats and continue to checkout.</p>}
    {error && <ErrorPanel message={error} retry={() => refresh().catch((problem) => setError(problem.message))} />}
  </main>;
}

function AuthPage({ mode }) {
  const isRegister = mode === "register";
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ fullName: "", username: "", email: "", phone: "", birthDate: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (user && !loading) navigate(params.get("next") || "/profile", { replace: true }); }, [user, loading, navigate, params]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (isRegister) await register(form);
      else await login({ email: form.email, password: form.password });
      navigate(params.get("next") || "/profile", { replace: true });
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-art"><span className="eyebrow">TAKE YOUR SEAT</span><div className="auth-art-title">Your next<br /><em>great night</em><br />starts here.</div><div className="auth-art-circle">i</div><p>One account for all your movie nights.</p></div><div className="auth-form-wrap"><span className="eyebrow">{isRegister ? "JOIN THE CLUB" : "WELCOME BACK"}</span><h1>{isRegister ? "Create an account." : "Good to see you."}</h1><p className="auth-intro">{isRegister ? "Keep your tickets, favorites and plans together." : "Sign in to pick up where the previews left off."}</p>
    <form className="stack-form" onSubmit={submit}>
      {isRegister && <><label>Full name<input required minLength="2" maxLength="100" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Username<input required pattern="[a-zA-Z0-9_.-]{3,40}" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label></>}
      <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      {isRegister && <><label>Phone <span className="optional-label">optional</span><input type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Date of birth <span className="optional-label">optional</span><input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label></>}
      <label>Password<input required type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? "8" : undefined} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button button-primary full-width" disabled={busy}>{busy ? "Please wait…" : isRegister ? "Create account ↗" : "Sign in ↗"}</button>
    </form><p className="auth-switch">{isRegister ? "Already have an account?" : "New to iMovies?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
  </div></main>;
}

function BookingsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/users/me/bookings").then((data) => setItems(data.items || [])).catch((problem) => setError(problem.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const cancel = async (booking) => {
    if (!window.confirm("Cancel booking " + booking.bookingReference + "? A refund will be requested if the cancellation window is open.")) return;
    try { await api("/bookings/" + booking._id + "/cancel", { method: "POST", body: {} }); await load(); }
    catch (problem) { setError(problem.message); }
  };
  return <main className="page-content account-page"><div className="page-kicker"><span className="eyebrow">YOUR MOVIE NIGHTS</span><span>ACCOUNT / TICKETS</span></div><h1>My <em>tickets.</em></h1><p className="lead-copy">Your bookings and their payment status.</p>
    {loading ? <Loading label="Loading tickets" /> : error ? <ErrorPanel message={error} retry={load} /> : items.length ? <div className="booking-list">{items.map((booking) => <article className="booking-card" key={booking._id}><Poster movie={{ poster: booking.movie?.poster, movieName: booking.movie?.title || "Movie" }} /><div className="booking-info"><span className="eyebrow">BOOKING {booking.bookingReference}</span><h2>{booking.movie?.title}</h2><p>{showDate(booking.showtime)} · {booking.theater?.name || "Theater"} · {booking.auditorium}</p><p>Seats: {(booking.seats || []).map((seat) => seat.seatId).join(", ")}</p><span className={"status-pill status-" + booking.paymentStatus}>{booking.paymentStatus}</span></div><div className="booking-amount"><strong>{money(booking.amount)}</strong>{booking.paymentStatus === "paid" && booking.status === "confirmed" && <span>Confirmed</span>}{booking.status === "pending" && <button className="text-button" onClick={() => cancel(booking)}>Cancel hold</button>}{booking.status === "confirmed" && booking.paymentStatus === "paid" && <button className="text-button" onClick={() => cancel(booking)}>Cancel booking</button>}</div></article>)}</div> : <div className="empty-panel"><h3>No bookings yet</h3><p>Your next night at the movies is waiting.</p><Link to="/movies" className="button button-primary">Browse movies</Link></div>}
  </main>;
}

function FavoritesPage() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/users/me/favorites").then((data) => setMovies(data.items || [])).catch((problem) => setError(problem.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (id) => { try { await api("/users/me/favorites/" + id, { method: "DELETE" }); setMovies((items) => items.filter((movie) => String(movie._id) !== String(id))); } catch (problem) { setError(problem.message); } };
  return <main className="page-content account-page"><div className="page-kicker"><span className="eyebrow">SAVED FOR LATER</span><span>ACCOUNT / WATCHLIST</span></div><h1>Your <em>watchlist.</em></h1>{loading ? <Loading label="Loading watchlist" /> : error ? <ErrorPanel message={error} retry={load} /> : movies.length ? <><MovieGrid movies={movies} /><div className="watchlist-actions">{movies.map((movie) => <button key={movie._id} className="text-button" onClick={() => remove(movie._id)}>Remove {movie.movieName}</button>)}</div></> : <div className="empty-panel"><h3>Nothing saved yet</h3><p>Save films you want to catch later.</p><Link to="/movies" className="button button-primary">Browse movies</Link></div>}</main>;
}

function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", birthDate: user?.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const data = await api("/users/me", { method: "PATCH", body: form }); setUser(data.user); setMessage("Profile saved."); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return <main className="page-content account-page"><div className="page-kicker"><span className="eyebrow">YOUR ACCOUNT</span><span>ACCOUNT / PROFILE</span></div><h1>About <em>you.</em></h1><form className="profile-form stack-form" onSubmit={save}><label>Full name<input required minLength="2" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Email<input disabled value={user?.email || ""} /></label><label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Date of birth<input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label>{error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}<button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form></main>;
}

function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const cancelledBookingId = params.get("booking");
  const [state, setState] = useState({ loading: true, message: "Checking payment status with Stripe…", booking: null, error: "" });
  useEffect(() => {
    let active = true;
    let timer;
    if (cancelledBookingId) {
      api("/bookings/" + cancelledBookingId + "/lock", { method: "DELETE" }).then(() => { if (active) setState({ loading: false, message: "Checkout was cancelled. Your seat hold has been released.", booking: null, error: "" }); }).catch((problem) => { if (active) setState({ loading: false, message: "", booking: null, error: problem.message }); });
      return () => { active = false; };
    }
    if (!sessionId) { setState({ loading: false, message: "", booking: null, error: "Checkout session was not provided." }); return () => { active = false; }; }
    let attempts = 0;
    const check = async () => {
      try {
        const data = await api("/payments/sessions/" + encodeURIComponent(sessionId));
        if (!active) return;
        if (data.status === "paid" && data.booking.status === "confirmed") {
          setState({ loading: false, message: "Payment verified. Your tickets are confirmed.", booking: data.booking, error: "" });
        } else if (data.status === "refunded") {
          setState({ loading: false, message: "The seat hold expired before confirmation. Stripe has been asked to refund the payment.", booking: data.booking, error: "" });
        } else if (attempts++ < 8) {
          setState({ loading: true, message: "Payment is still processing. Checking again…", booking: data.booking, error: "" });
          timer = window.setTimeout(check, 2500);
        } else {
          setState({ loading: false, message: "Payment status is pending. Check My Tickets shortly.", booking: data.booking, error: "" });
        }
      } catch (problem) { if (active) setState({ loading: false, message: "", booking: null, error: problem.message }); }
    };
    check();
    return () => { active = false; window.clearTimeout(timer); };
  }, [sessionId, cancelledBookingId]);
  return <main className="page-content checkout-result"><span className="eyebrow">CHECKOUT</span><div className="checkout-icon">{state.loading ? "…" : state.error ? "!" : "✓"}</div><h1>{state.loading ? "Verifying payment." : state.error ? "We couldn't verify that." : "You're all set."}</h1><p>{state.loading ? <><span className="spinner" /> {state.message}</> : state.error || state.message}</p>{state.booking?.reference && <div className="reference-card"><span className="eyebrow">BOOKING REFERENCE</span><strong>{state.booking.reference}</strong><span className={"status-pill status-" + state.booking.paymentStatus}>{state.booking.paymentStatus}</span></div>}<div className="hero-actions centered"><Link className="button button-primary" to="/bookings">View my tickets ↗</Link><Link className="button button-outline" to="/movies">Back to films</Link></div></main>;
}

function NotFound() {
  return <main className="page-content not-found"><span className="eyebrow">404 / LOST IN THE REEL</span><h1>This scene<br /><em>isn't here.</em></h1><Link className="button button-primary" to="/">Back to the lobby ↗</Link></main>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><Shell /></AuthProvider></BrowserRouter>;
}
