# S01: Authentication Foundation - User Acceptance Testing

This document provides step-by-step instructions for manually testing the authentication system built in S01.

## Prerequisites

1. Ensure you have Bun installed
2. Install dependencies:
   ```bash
   cd playground
   bun install
   ```
3. Set the JWT secret:
   ```bash
   export JWT_SECRET="your-secret-key-here"
   ```

## Starting the Server

```bash
cd playground
bun run src/index.ts
```

You should see:
```
Starting server on port 3000...
Server running at http://localhost:3000
```

## Test Scenarios

### 1. Health Check

Verify the server is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

### 2. User Registration (Signup)

#### 2.1 Successful Registration

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "password123"}'
```

Expected response (201):
```json
{"token":"eyJ..."}
```

Save the token for later use:
```bash
export TOKEN="<paste-token-here>"
```

#### 2.2 Duplicate Email

Try registering with the same email again:

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "different123"}'
```

Expected response (409):
```json
{"error":"User already exists"}
```

#### 2.3 Invalid Email Format

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email", "password": "password123"}'
```

Expected response (400):
```json
{"error":"Invalid email format"}
```

#### 2.4 Short Password

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "bob@example.com", "password": "short"}'
```

Expected response (400):
```json
{"error":"Password must be at least 8 characters"}
```

#### 2.5 Missing Fields

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "charlie@example.com"}'
```

Expected response (400):
```json
{"error":"Email and password are required"}
```

### 3. User Login

#### 3.1 Successful Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "password123"}'
```

Expected response (200):
```json
{"token":"eyJ..."}
```

#### 3.2 Wrong Password

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "wrongpassword"}'
```

Expected response (401):
```json
{"error":"Invalid credentials"}
```

#### 3.3 Non-existent User

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "nobody@example.com", "password": "password123"}'
```

Expected response (401):
```json
{"error":"Invalid credentials"}
```

Note: Same error message as wrong password (security best practice)

#### 3.4 Missing Fields

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com"}'
```

Expected response (400):
```json
{"error":"Email and password are required"}
```

### 4. Protected Routes

#### 4.1 Access with Valid Token

Using the token from signup or login:

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

Expected response (200):
```json
{"userId":"<uuid>","email":"alice@example.com"}
```

#### 4.2 Access without Token

```bash
curl http://localhost:3000/api/auth/me
```

Expected response (401):
```json
{"error":"Unauthorized"}
```

#### 4.3 Access with Invalid Token

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer invalid.token.here"
```

Expected response (401):
```json
{"error":"Unauthorized"}
```

#### 4.4 Access with Malformed Header

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: NotBearer $TOKEN"
```

Expected response (401):
```json
{"error":"Unauthorized"}
```

## Database Verification

Check the SQLite database directly:

```bash
# From the playground directory
bunx sqlite3 ./data/app.db

# In SQLite prompt:
.tables
# Should show: users

.schema users
# Should show the table structure

SELECT id, email, created_at FROM users;
# Should show registered users (no passwords!)

.quit
```

## Automated Test Suite

Run the full test suite to verify all components:

```bash
cd playground
bun test
```

Expected output:
```
✓ All tests should pass
✓ ~28 test cases total
✓ 100% coverage of critical paths
```

## Cleanup

To reset the database for fresh testing:

```bash
rm -f playground/data/app.db
```

The database will be recreated automatically when the server starts.

## Success Criteria

✅ Server starts without errors  
✅ Users can sign up with valid email/password  
✅ Duplicate emails are rejected  
✅ Users can log in with correct credentials  
✅ Invalid credentials are rejected  
✅ JWT tokens are returned on signup/login  
✅ Protected routes require valid tokens  
✅ Token payload contains userId and email  
✅ All error responses use consistent format