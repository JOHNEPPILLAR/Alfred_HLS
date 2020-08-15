FROM node:14-alpine

ENV TZ=Europe/London

RUN mkdir -p /home/nodejs/app \
	&& mkdir -p /home/nodejs/app/media \
	&& apk --no-cache --virtual build-dependencies --update add \
	tzdata \
	git \ 
	g++ \
	gcc \
	libgcc \
	libstdc++ \
	linux-headers \
	make \
	python \
	ffmpeg \
	curl \
	&& npm install --quiet node-gyp -g \
	&& ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
	&& echo $TZ > /etc/timezone \
	&& apk del tzdata \
	&& rm -rf /var/cache/apk/*

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

RUN chown node /home/nodejs/app/media

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3978
