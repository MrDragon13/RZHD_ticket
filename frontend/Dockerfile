FROM nginx:alpine

# Статический frontend не требует сборки: nginx сразу отдает HTML/CSS/JS.
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
