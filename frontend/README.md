# iMovies customer app

React, Vite and React Router customer experience. It consumes the Express API configured by VITE_API_BASE_URL (with VITE_API_URL retained as a compatibility alias) and uses Socket.IO from VITE_SOCKET_URL for authenticated show seat updates.

From this directory, copy .env.example to .env, run npm install and npm run dev. The app uses http://localhost:5173 by default. For production, set the API and socket URLs to the deployed backend and deploy the output of npm run build as a static site with SPA fallback enabled.

If the API is unavailable, the app displays the existing local poster preview catalog and clearly disables live booking.
