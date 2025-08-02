# Copilot Instructions

## Project Overview
This project is a Node.js file upload server that accepts multiple files of any type and saves them under the `/uploads` directory. The server runs on port 6748.

## Coding Guidelines
- Use Express.js for the server.
- Use `busboy` or `multer` for handling file uploads.
- Ensure the `/uploads` directory exists before saving files.
- Support uploading multiple files in a single request.
- Save files with unique names if a file with the same name already exists.
- Log upload progress to the console.

## Best Practices
- Handle errors gracefully and return appropriate HTTP status codes.
- Do not expose sensitive server information in responses.
- Keep the code modular and readable.

## Example Endpoints
- `POST /upload` — Accepts file uploads (multipart/form-data).
- `GET /uploads/:filename` — Serves uploaded files.

## Additional Notes
- The server should be easy to run with `node server.js`.
- All dependencies should be listed in `package.json`.
