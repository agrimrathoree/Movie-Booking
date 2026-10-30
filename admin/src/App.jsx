import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, clearCsrfToken } from "./api.js";
import "./App.css";

const AuthContext = createContext(null);
const useAdminAuth = () => useContext(AuthContext);
const currency = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dateLabel = (value) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const customerUrl = import.meta.env.VITE_CUSTOMER_URL || "http://localhost:5173";

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api("/auth/me").then((data) => { if (active) setUser(data.user); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({
    user, loading, setUser,
    async login(email, password) { const data = await api("/auth/login", { method: "POST", body: { email, password } }); setUser(data.user); return data.user; },
    async logout() { await api("/auth/logout", { method: "POST", body: {} }); clearCsrfToken(); setUser(null); },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Loading({ message = "Loading" }) {
  return <div className="admin-loading"><span className="admin-spinner" />{message}…</div>;
}

function Feedback({ error, success }) {
  if (!error && !success) return null;
  return <div className={error ? "admin-feedback error" : "admin-feedback success"} role="status">{error || success}</div>;
}

function Gate({ children }) {
  const { user, loading } = useAdminAuth();
  if (loading) return <Loading message="Checking access" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <main className="admin-denied"><span className="admin-brand-mark">i</span><h1>Administrator access required</h1><p>Sign in with an administrator account to use this dashboard.</p><Link to="/login" className="admin-button">Back to sign in</Link></main>;
  return children;
}

function LoginPage() {
  const { user, loading, login, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (user?.role === "admin" && !loading) navigate("/", { replace: true }); }, [user, loading, navigate]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const account = await login(email, password);
      if (account.role !== "admin") { await logout(); setError("This account does not have administrator permissions."); return; }
      navigate("/", { replace: true });
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return <main className="admin-login">
    <div className="admin-login-art"><span className="admin-brand-mark">i</span><div><span className="admin-eyebrow">iMOVIES OPERATIONS</span><h1>Every detail<br /><em>in the frame.</em></h1><p>Manage your catalog, screenings and ticket sales.</p></div><span className="login-art-number">01 / CONTROL ROOM</span></div>
    <div className="admin-login-main"><div className="admin-login-card"><span className="admin-eyebrow">STAFF SIGN IN</span><h2>Welcome back.</h2><p>Sign in with your administrator account.</p><form className="admin-form" onSubmit={submit}><label>Email address<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><Feedback error={error} /><button className="admin-button" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard ↗"}</button></form><Link to="/" className="back-to-site">← Customer site</Link></div></div>
  </main>;
}

function DashboardLayout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const signOut = async () => {
    try { await logout(); navigate("/login", { replace: true }); }
    catch (problem) { setError(problem.message); }
  };
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link to="/" className="admin-brand"><span className="admin-brand-mark">i</span><span>movies<small>ADMIN</small></span></Link>
      <span className="admin-eyebrow side-label">WORKSPACE</span>
      <nav className="admin-nav"><NavLink end to="/" className={({ isActive }) => isActive ? "active" : ""}><span>◫</span>Overview</NavLink><NavLink to="/movies" className={({ isActive }) => isActive ? "active" : ""}><span>▤</span>Movies</NavLink><NavLink to="/shows" className={({ isActive }) => isActive ? "active" : ""}><span>◷</span>Showtimes</NavLink><NavLink to="/theaters" className={({ isActive }) => isActive ? "active" : ""}><span>▦</span>Theaters</NavLink><NavLink to="/bookings" className={({ isActive }) => isActive ? "active" : ""}><span>▣</span>Bookings</NavLink></nav>
      <div className="admin-side-bottom"><div className="admin-avatar">{(user?.fullName || "A").slice(0, 1).toUpperCase()}</div><div className="admin-user"><strong>{user?.fullName}</strong><span>{user?.email}</span></div><button aria-label="Sign out" onClick={signOut}>↗</button></div>
    </aside>
    <div className="admin-main"><header className="admin-topbar"><div><span className="admin-eyebrow">iMOVIES / MANAGEMENT</span><span className="topbar-title">Control room</span></div><div className="topbar-right"><span className="live-indicator" /> API connected <a href={customerUrl} target="_blank" rel="noreferrer">Open customer site ↗</a></div></header><Feedback error={error} /><Routes><Route path="/" element={<OverviewPage />} /><Route path="/movies" element={<MoviesAdminPage />} /><Route path="/shows" element={<ShowsAdminPage />} /><Route path="/theaters" element={<TheatersAdminPage />} /><Route path="/bookings" element={<BookingsAdminPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></div>
  </div>;
}

function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/admin/stats"), api("/admin/bookings?limit=6")]).then(([summary, recent]) => { setStats(summary.stats); setBookings(recent.items || []); }).catch((problem) => setError(problem.message));
  }, []);
  if (!stats && !error) return <Loading message="Loading overview" />;
  const cards = [
    ["MOVIES", stats?.movies || 0, "Active in catalog"],
    ["UPCOMING SHOWS", stats?.upcomingShows || 0, "Scheduled screenings"],
    ["PAID BOOKINGS", stats?.paidBookings || 0, "Confirmed tickets"],
    ["GROSS SALES", currency(stats?.gross), "Payments verified"],
  ];
  return <section className="admin-content"><PageHeading eyebrow="OVERVIEW" title="Good morning." subtitle="Your cinema, at a glance." /><Feedback error={error} />
    <div className="stats-grid">{cards.map((card) => <article className="stat-card" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small>{card[2]}</small></article>)}</div>
    <div className="overview-lower"><section className="admin-panel recent-bookings"><div className="panel-heading"><div><span className="admin-eyebrow">LATEST ACTIVITY</span><h2>Recent bookings</h2></div><Link to="/bookings">All bookings ↗</Link></div>{bookings.length ? <div className="recent-list">{bookings.map((booking) => <div className="recent-row" key={booking._id}><div className="mini-avatar">{(booking.userId?.fullName || "G").slice(0, 1).toUpperCase()}</div><div className="recent-name"><strong>{booking.userId?.fullName || "Customer"}</strong><span>{booking.movie?.title} · {booking.bookingReference}</span></div><span className={"admin-status status-" + booking.paymentStatus}>{booking.paymentStatus}</span><strong>{currency(booking.amount)}</strong></div>)}</div> : <Empty text="New bookings will appear here." />}</section>
      <section className="admin-panel quick-links"><span className="admin-eyebrow">QUICK ACTIONS</span><h2>Move things along.</h2><Link to="/movies" className="quick-link"><span>＋</span><div><strong>Add a movie</strong><small>Build out the catalog</small></div><b>↗</b></Link><Link to="/shows" className="quick-link"><span>◷</span><div><strong>Schedule a show</strong><small>Put a film on the calendar</small></div><b>↗</b></Link><Link to="/theaters" className="quick-link"><span>▦</span><div><strong>Add a theater</strong><small>Set up a new location</small></div><b>↗</b></Link></section></div>
    <div className="admin-footnote"><span>◉</span> Snapshot reflects records in the connected MongoDB database.</div>
  </section>;
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="admin-page-heading"><div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Empty({ text }) {
  return <div className="admin-empty"><span>✦</span><p>{text}</p></div>;
}

const emptyMovie = { movieName: "", categories: "", language: "Hindi", year: "", releaseDate: "", duration: "", rating: "", poster: "", description: "", standardPrice: "250", reclinerPrice: "375", type: "normal" };

function MoviesAdminPage() {
  const [movies, setMovies] = useState([]);
  const [form, setForm] = useState(emptyMovie);
  const [editing, setEditing] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(() => api("/admin/movies").then((data) => setMovies(data.items || [])).catch((problem) => setError(problem.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  const edit = (movie) => {
    setEditing(movie._id);
    setForm({ movieName: movie.movieName || "", categories: (movie.categories || movie.genres || []).join(", "), language: movie.language || "Hindi", year: movie.year || "", releaseDate: movie.releaseDate ? new Date(movie.releaseDate).toISOString().slice(0, 10) : "", duration: movie.duration || "", rating: movie.rating || "", poster: movie.poster || "", description: movie.description || movie.story || "", standardPrice: movie.seatPrices?.standard ?? 250, reclinerPrice: movie.seatPrices?.recliner ?? 375, type: movie.type || "normal" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const payload = { ...form, year: Number(form.year) || null, duration: Number(form.duration) || 0, rating: Number(form.rating) || 0, seatPrices: { standard: Number(form.standardPrice), recliner: Number(form.reclinerPrice) } };
    try {
      if (editing) await api("/admin/movies/" + editing, { method: "PATCH", body: payload });
      else await api("/admin/movies", { method: "POST", body: payload });
      setSuccess(editing ? "Movie details updated." : "Movie added to the catalog.");
      setForm(emptyMovie); setEditing(""); await load();
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  const archive = async (movie) => {
    if (!window.confirm("Archive " + movie.movieName + "? This hides it from the customer catalog and preserves its records.")) return;
    try { await api("/admin/movies/" + movie._id, { method: "DELETE" }); setSuccess("Movie archived."); await load(); }
    catch (problem) { setError(problem.message); }
  };
  return <section className="admin-content"><PageHeading eyebrow="CATALOG / MOVIES" title="The lineup." subtitle="Manage movie details, images and ticket pricing." />
    <section className="admin-panel editor-panel"><div className="panel-heading"><div><span className="admin-eyebrow">{editing ? "EDIT FILM" : "NEW FILM"}</span><h2>{editing ? "Update movie details" : "Add a movie"}</h2></div>{editing && <button className="admin-quiet-button" onClick={() => { setEditing(""); setForm(emptyMovie); }}>Cancel edit</button>}</div><form className="admin-form grid-form" onSubmit={submit}>
      <label>Movie title<input required minLength="2" maxLength="200" value={form.movieName} onChange={(event) => setForm({ ...form, movieName: event.target.value })} /></label><label>Genres <small>comma separated</small><input required value={form.categories} onChange={(event) => setForm({ ...form, categories: event.target.value })} placeholder="Action, Drama" /></label><label>Language<input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} /></label><label>Release date<input required type="date" value={form.releaseDate} onChange={(event) => setForm({ ...form, releaseDate: event.target.value })} /></label><label>Release year<input type="number" min="1888" max="2200" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></label><label>Runtime · minutes<input type="number" min="0" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /></label><label>Rating · /10<input type="number" min="0" max="10" step=".1" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} /></label><label>Standard seat · ₹<input required type="number" min="0" step=".01" value={form.standardPrice} onChange={(event) => setForm({ ...form, standardPrice: event.target.value })} /></label><label>Recliner seat · ₹<input required type="number" min="0" step=".01" value={form.reclinerPrice} onChange={(event) => setForm({ ...form, reclinerPrice: event.target.value })} /></label><label className="span-two">Poster URL or stored filename<input value={form.poster} onChange={(event) => setForm({ ...form, poster: event.target.value })} placeholder="https://… or FM1.png" /></label><label>Catalog status<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="normal">Now showing</option><option value="featured">Featured</option><option value="releaseSoon">Coming soon</option></select></label><label className="span-two">Synopsis<textarea required minLength="10" rows="3" maxLength="5000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="span-two"><Feedback error={error} success={success} /><button className="admin-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save movie changes" : "Add movie to catalog"} <span>↗</span></button></div>
    </form></section>
    <section className="admin-panel table-panel"><div className="panel-heading"><div><span className="admin-eyebrow">ACTIVE RECORDS</span><h2>Movie catalog</h2></div><span className="table-count">{movies.filter((movie) => movie.active).length} active</span></div>{loading ? <Loading /> : movies.length ? <div className="table-scroll"><table><thead><tr><th>FILM</th><th>GENRE / LANGUAGE</th><th>STANDARD</th><th>STATUS</th><th /></tr></thead><tbody>{movies.map((movie) => <tr key={movie._id}><td><strong>{movie.movieName}</strong><small>{movie.year || "Year not set"}</small></td><td>{(movie.categories || []).join(", ") || "—"}<small>{movie.language}</small></td><td>{currency(movie.seatPrices?.standard)}</td><td><span className={"admin-status " + (movie.active ? "status-paid" : "status-refunded")}>{movie.active ? movie.type === "featured" ? "featured" : "active" : "archived"}</span></td><td className="table-actions"><button onClick={() => edit(movie)}>Edit</button>{movie.active && <button className="danger-link" onClick={() => archive(movie)}>Archive</button>}</td></tr>)}</tbody></table></div> : <Empty text="Add a movie to start building your catalog." />}</section>
  </section>;
}

function TheatersAdminPage() {
  const [theaters, setTheaters] = useState([]);
  const [form, setForm] = useState({ name: "", city: "", address: "", screens: "Audi 1, Audi 2" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api("/admin/theaters").then((data) => setTheaters(data.items || [])).catch((problem) => setError(problem.message)), []);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try { await api("/admin/theaters", { method: "POST", body: { ...form, screens: form.screens.split(",").map((item) => item.trim()).filter(Boolean) } }); setForm({ name: "", city: "", address: "", screens: "Audi 1, Audi 2" }); setSuccess("Theater created."); await load(); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  return <section className="admin-content"><PageHeading eyebrow="VENUES / THEATERS" title="Places to watch." subtitle="Set up theater locations and screens for showtimes." />
    <div className="management-grid"><section className="admin-panel"><div className="panel-heading"><div><span className="admin-eyebrow">NEW LOCATION</span><h2>Add a theater</h2></div></div><form className="admin-form" onSubmit={submit}><label>Theater name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>City<input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label><label>Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label><label>Screens <small>comma separated</small><input value={form.screens} onChange={(event) => setForm({ ...form, screens: event.target.value })} /></label><Feedback error={error} success={success} /><button className="admin-button" disabled={busy}>{busy ? "Saving…" : "Create theater ↗"}</button></form></section>
      <section className="admin-panel"><div className="panel-heading"><div><span className="admin-eyebrow">VENUE DIRECTORY</span><h2>Your theaters</h2></div></div>{theaters.length ? <div className="theater-list">{theaters.map((theater) => <article className="theater-card" key={theater._id}><div className="theater-symbol">▦</div><div><h3>{theater.name}</h3><p>{theater.city}{theater.address ? " · " + theater.address : ""}</p><span>{(theater.screens || []).map((screen) => screen.name).join(" · ")}</span></div></article>)}</div> : <Empty text="Your theater locations will appear here." />}</section></div>
  </section>;
}

function ShowsAdminPage() {
  const [movies, setMovies] = useState([]);
  const [theaters, setTheaters] = useState([]);
  const [shows, setShows] = useState([]);
  const [form, setForm] = useState({ movieId: "", theaterId: "", auditorium: "", startsAt: "", standard: "", recliner: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => Promise.all([api("/admin/movies"), api("/admin/theaters"), api("/admin/shows")]).then(([movieData, theaterData, showData]) => {
    const activeMovies = (movieData.items || []).filter((movie) => movie.active);
    setMovies(activeMovies); setTheaters((theaterData.items || []).filter((theater) => theater.active)); setShows(showData.items || []);
    setForm((current) => ({ ...current, movieId: current.movieId || activeMovies[0]?._id || "", theaterId: current.theaterId || theaterData.items?.[0]?._id || "" }));
  }).catch((problem) => setError(problem.message)), []);
  useEffect(() => { load(); }, [load]);
  const selectedMovie = movies.find((movie) => movie._id === form.movieId);
  const selectedTheater = theaters.find((theater) => theater._id === form.theaterId);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      await api("/admin/shows", { method: "POST", body: { movieId: form.movieId, theaterId: form.theaterId, auditorium: form.auditorium || selectedTheater?.screens?.[0]?.name, startsAt: new Date(form.startsAt).toISOString(), seatPrices: { standard: Number(form.standard || selectedMovie?.seatPrices?.standard), recliner: Number(form.recliner || selectedMovie?.seatPrices?.recliner) } } });
      setForm((current) => ({ ...current, startsAt: "" })); setSuccess("Showtime scheduled."); await load();
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  const archive = async (show) => {
    if (!window.confirm("Archive this screening? It will be hidden from the customer site.")) return;
    try { await api("/admin/shows/" + show._id, { method: "DELETE" }); setSuccess("Screening archived."); await load(); } catch (problem) { setError(problem.message); }
  };
  return <section className="admin-content"><PageHeading eyebrow="SCHEDULE / SCREENINGS" title="Set the show." subtitle="Create future screenings with server-side seat prices." />
    <section className="admin-panel editor-panel"><div className="panel-heading"><div><span className="admin-eyebrow">NEW SCREENING</span><h2>Schedule a show</h2></div></div>{!movies.length || !theaters.length ? <Empty text="Add an active movie and a theater before scheduling a show." /> : <form className="admin-form grid-form" onSubmit={submit}><label>Movie<select required value={form.movieId} onChange={(event) => setForm({ ...form, movieId: event.target.value })}>{movies.map((movie) => <option value={movie._id} key={movie._id}>{movie.movieName}</option>)}</select></label><label>Theater<select required value={form.theaterId} onChange={(event) => setForm({ ...form, theaterId: event.target.value, auditorium: "" })}>{theaters.map((theater) => <option value={theater._id} key={theater._id}>{theater.name} · {theater.city}</option>)}</select></label><label>Screen<select required value={form.auditorium || selectedTheater?.screens?.[0]?.name || ""} onChange={(event) => setForm({ ...form, auditorium: event.target.value })}>{(selectedTheater?.screens || []).map((screen) => <option value={screen.name} key={screen.name}>{screen.name}</option>)}</select></label><label>Starts at<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label><label>Standard seat · ₹<input type="number" min="0" step=".01" placeholder={String(selectedMovie?.seatPrices?.standard || 250)} value={form.standard} onChange={(event) => setForm({ ...form, standard: event.target.value })} /></label><label>Recliner seat · ₹<input type="number" min="0" step=".01" placeholder={String(selectedMovie?.seatPrices?.recliner || 375)} value={form.recliner} onChange={(event) => setForm({ ...form, recliner: event.target.value })} /></label><div className="span-two"><Feedback error={error} success={success} /><button className="admin-button" disabled={busy}>{busy ? "Scheduling…" : "Schedule showtime ↗"}</button></div></form>}</section>
    <section className="admin-panel table-panel"><div className="panel-heading"><div><span className="admin-eyebrow">SCREENING CALENDAR</span><h2>Showtimes</h2></div></div>{shows.length ? <div className="table-scroll"><table><thead><tr><th>FILM</th><th>THEATER / SCREEN</th><th>STARTS AT</th><th>SEAT PRICES</th><th /></tr></thead><tbody>{shows.map((show) => <tr key={show._id}><td><strong>{show.movieId?.movieName || "Movie"}</strong></td><td>{show.theaterId?.name}<small>{show.auditorium} · {show.theaterId?.city}</small></td><td>{dateLabel(show.startsAt)}</td><td>{currency(show.seatPrices?.standard)} / {currency(show.seatPrices?.recliner)}</td><td className="table-actions">{show.active && <button className="danger-link" onClick={() => archive(show)}>Archive</button>}</td></tr>)}</tbody></table></div> : <Empty text="There are no screenings yet." />}</section>
  </section>;
}

function BookingsAdminPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/admin/bookings?limit=100").then((data) => setBookings(data.items || [])).catch((problem) => setError(problem.message)).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  return <section className="admin-content"><PageHeading eyebrow="SALES / BOOKINGS" title="Every seat counted." subtitle="View booking, payment and customer status." /><Feedback error={error} />
    <section className="admin-panel table-panel"><div className="panel-heading"><div><span className="admin-eyebrow">BOOKING REGISTER</span><h2>All bookings</h2></div><span className="table-count">{bookings.length} records</span></div>{loading ? <Loading /> : bookings.length ? <div className="table-scroll"><table><thead><tr><th>REFERENCE / CUSTOMER</th><th>MOVIE / SHOW</th><th>SEATS</th><th>AMOUNT</th><th>PAYMENT</th><th>BOOKING</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking._id}><td><strong>{booking.bookingReference}</strong><small>{booking.userId?.fullName || "Customer"} · {booking.userId?.email || ""}</small></td><td>{booking.movie?.title}<small>{dateLabel(booking.showtime)} · {booking.auditorium}</small></td><td>{(booking.seats || []).map((seat) => seat.seatId).join(", ")}</td><td>{currency(booking.amount)}</td><td><span className={"admin-status status-" + booking.paymentStatus}>{booking.paymentStatus}</span></td><td><span className={"admin-status " + (booking.status === "confirmed" ? "status-paid" : "status-refunded")}>{booking.status}</span></td></tr>)}</tbody></table></div> : <Empty text="Bookings will appear here once customers complete a checkout." />}</section>
  </section>;
}

function AdminApp() {
  const { user, loading } = useAdminAuth();
  if (loading) return <Loading message="Loading control room" />;
  return <Routes><Route path="/login" element={user?.role === "admin" ? <Navigate to="/" replace /> : <LoginPage />} /><Route path="/*" element={<Gate><DashboardLayout /></Gate>} /></Routes>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><AdminApp /></AuthProvider></BrowserRouter>;
}
