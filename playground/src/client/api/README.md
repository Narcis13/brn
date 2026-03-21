# API Clients

This directory contains API client modules for interacting with the backend.

## Auth API (`auth.ts`)
- `login(email, password)` - Authenticates user and returns JWT token
- `signup(email, password)` - Creates new user account and returns JWT token
- `storeToken(token)` - Saves JWT token to localStorage
- `getToken()` - Retrieves stored JWT token
- `clearToken()` - Removes JWT token from storage

## Upcoming APIs
- `boards.ts` - Board CRUD operations
- `cards.ts` - Card CRUD and movement operations