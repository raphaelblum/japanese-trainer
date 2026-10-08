FROM python:3.13-alpine

WORKDIR /app
COPY server.py /app/server.py
COPY www /app/www

# Only the Home Assistant ingress proxy may talk to the app; it handles the login.
CMD ["python3", "-u", "/app/server.py", "--port", "8099", "--data", "/data", "--trusted", "172.30.32.2"]
