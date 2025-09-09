# DumbBin

A stupidly simple pastebin application that just works. No complex database, no unnecessary features - just stuff you paste in there.

This project is an adaptation of [DumbDo](https://www.dumbware.io/DumbDo). I made this in the spirit
of Dumbware.io's "Dumb" design system, which emphasizes simplicity and minimalism. 
I made this for myself, but I hope you find it useful too.


## Features

- ✨ Clean, minimal interface
- 🌓 Dark/Light mode with system preference detection
- 💾 File-based storage - items persist between sessions
- 📱 Fully responsive design
- 🚀 Fast and lightweight
- 🔒 PIN protection (4-10 digits if enabled)
- 🌐 PWA Support

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| PORT | The port number the server will listen on | 3000 | No |
| DUMBBIN_PIN | PIN protection for accessing items (4-10 digits) | - | No |

## Quick Start

### Running Locally

1. Clone the repository
```bash
git clone https://github.com/DumbBin/DumbBin.git
git checkout prod
cd DumbBin
```

2. Install dependencies
```bash
npm install
```

3. Start the server
```bash
npm start
```

4. Open http://localhost:3000 in your browser

### Using Docker

```bash
docker run --rm -p 3000:3000 -v $(pwd)/data:/app/data dumbbin/dumbbin
```

### Using Docker Compose

1. Create a `docker-compose.yml` file
```yaml
services:
  dumbbin:
    image: dumbbin/dumbbin
    container_name: dumbbin
    restart: unless-stopped
    ports:
      - ${DUMBBIN_PORT:-3000}:3000
    volumes:
      - ${DUMBBIN_DATA_PATH:-./data}:/app/data
    environment:
      - DUMBBIN_PIN=${DUMBBIN_PIN-}
      - DUMBBIN_SITE_TITLE=DumbBin
      # (Optional) Restrict origins - ex: https://subdomain.domain.tld,https://auth.proxy.tld,http://internalip:port' (default is '*')
      # - ALLOWED_ORIGINS=http://localhost:3000
      # - NODE_ENV=development # default production (development allows all origins)
    # healthcheck:
    #  test: wget --spider -q  http://127.0.0.1:3000/api/status
    #  start_period: 20s
    #  interval: 20s
    #  timeout: 5s
    #  retries: 3
```

2. Run the application
```bash
docker-compose up
```


## Storage

Items are stored in a JSON file at `app/data/items.json`. The file is automatically created when you first run the application. 

To backup your items, simply copy the `data` directory. To restore, place your backup `items.json` in the `data` directory.

## Development

The application follows the "Dumb" design system principles:

- No complex storage
- Single purpose, done well
- "It just works"

### Project Structure

```
dumbbin/
├── app.js          # Frontend JavaScript
├── index.html      # Main HTML file
├── server.js       # Node.js server
├── styles.css      # CSS styles
├── data/          # Item storage directory
│   └── items.json
├── Dockerfile     # Docker configuration
└── package.json   # Dependencies and scripts
```

## Health Check

The application includes a health check endpoint to monitor its status. You can access it at `http://[Your_Path]/api/status`.

## Contributing

This is meant to be a simple application. If you're writing complex code to solve a simple problem, you're probably doing it wrong. Keep it dumb, keep it simple. 

## License

The project on which this one is based ([DumbDo](https://github.com/DumbWareio/DumbDo)) is licensed under the GPL-3.0 License. This project is a derivative work and is also licensed under the GPL-3.0 License.

Modifications to the original code are made to change the use of the application from a todo list to a pastebin. As such, references to "todo" have been replaced with "item" or "items" throughout the codebase. Some branding has been changed to "DumbBin" instead of "DumbDo". Also, a copy to clipboard button has been added to the item view. The Docker image has also been updated to use Node 22. 
