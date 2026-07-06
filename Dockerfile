FROM nginx:alpine

# Copy our custom Nginx server configuration template
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Copy the game files
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY README.md /usr/share/nginx/html/

# Expose port 8080 (Cloud Run's default port)
ENV PORT 8080
EXPOSE 8080
