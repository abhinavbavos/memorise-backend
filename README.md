<h1 align="center">Welcome to profile-backend 👋</h1>
<p>
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000" />
</p>

> REST API built with Node + Express

# Trophy Fullstack Backend

A RESTful API for user profiles, posts, trophies, moderation, and billing, built with Node.js, Express, MongoDB, and AWS S3.

## Features

- User authentication (JWT)
- Profile management (avatar, cover, skills, etc.)
- Posts with file uploads (images, PDFs) and thumbnails
- Trophies (awards, certificates, etc.)
- Moderation: reports, admin actions, audit logs
- Billing: mock payment flows, plan upgrades
- S3 file storage with presigned URLs
- Rate limiting, input validation, security middleware

## Project Structure

```
src/
  index.js                # Main Express app
  config/                 # DB and S3 config
  controllers/            # Route handlers
  middleware/             # Auth, validation, limits, etc.
  models/                 # Mongoose schemas
  routes/                 # Express routers
  scripts/                # Utility scripts (e.g., seed.js)
  services/               # Service helpers (e.g., S3 signing)
  utils/                  # Utility functions
  worker/                 # Background workers (e.g., thumbWorker.js)
```

## Install

```sh

```

## Setup

1. **Install dependencies:**

   ```sh
   npm install
   ```

2. **Configure environment variables:**

   - Copy `.env` and fill in values for MongoDB, S3, JWT, etc.

3. **Seed the database (optional):**

   ```sh
   npm run seed
   ```

4. **Start the API server:**

   ```sh
   npm run dev
   ```

5. **Run the thumbnail worker (optional):**
   ```sh
   npm run worker
   ```

## API Endpoints

- `/api/auth` - Login, register, change password
- `/api/users` - Profile, avatar/cover upload, public profiles
- `/api/posts` - Create, list, delete posts
- `/api/trophies` - Manage trophies
- `/api/reports` - Submit moderation reports
- `/api/admin` - Admin dashboard, moderation, user/payment/settings management
- `/api/billing` - Billing and plan upgrades
- `/api/files` - S3 file signing
- `/api/meta` - Categories and metadata

## Technologies

- Node.js, Express
- MongoDB, Mongoose
- AWS S3
- JWT authentication
- Joi validation
- Security: Helmet, CORS, rate limiting, input sanitization

## Author

👤 \*\*Abhinav Bavos

## License

MIT

---

Give a ⭐️ if you found this project helpful!

---

_This README was generated with ❤️ by [readme-md-generator](https://github.com/kefranabg/readme-md-generator)_
