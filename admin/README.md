# iMovies admin app

Protected React/Vite operations panel for managing movies, theaters, future shows and bookings. Authorization is enforced by the backend admin role on every management endpoint.

From this directory, copy .env.example to .env, run npm install and npm run dev. The app uses http://localhost:5174 by default. Configure VITE_API_URL for the API and VITE_CUSTOMER_URL for the customer app link. Deploy the output of npm run build as a static site with SPA fallback enabled.

Create the initial administrator by setting ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before running the backend seed command.
