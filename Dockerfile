FROM node:13-alpine

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& mkdir -p /home/nodejs/app \
	&& apk --no-cache --virtual build-dependencies add \
	git \ 
	g++ \
	gcc \
	libgcc \
	libstdc++ \
	linux-headers \
	make \
	python \
	ffmpeg \
	&& npm install --quiet node-gyp -g \
	&& rm -rf /var/cache/apk/*

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

USER node

RUN groupmod -g 500 node && usermod -u 500 node \
	&& mkdir /home/nodejs/app/media/stream \
	&& mkdir /home/nodejs/app/media/recordings

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3978
