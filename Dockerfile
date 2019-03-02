FROM node:11

USER root

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get -y update \
	&& apt-get install ca-certificates \
	&& echo "deb http://ftp.uk.debian.org/debian jessie-backports main" | tee -a /etc/apt/sources.list \
 	&& apt-get -y update \
	&& apt-get install -y ffmpeg \
	&& mkdir -p /home/nodejs/app 

WORKDIR /home/nodejs/app

COPY . /home/nodejs/app

RUN rm -rf node_modules \
    && npm update
		
RUN npm install --production

RUN npm install pino-elasticsearch -g

CMD [ "npm", "start" ]

HEALTHCHECK --interval=12s --timeout=12s --start-period=30s \  
 CMD node lib/healthcheck.js

EXPOSE 3982
