FROM node:11

USER root

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get -y update \
	&& apt-get -y upgrade \
	&& apt-get install ca-certificates \
	&& echo "deb http://ftp.uk.debian.org/debian jessie-backports main" | tee -a /etc/apt/sources.list \
 	&& apt-get -y update \
	&& apt-get install -y ffmpeg \
	&& mkdir -p /home/nodejs/app 

WORKDIR /home/nodejs/app

COPY . /home/nodejs/app

RUN npm install --production

RUN npm install pino-elasticsearch -g

CMD [ "npm", "start" ]

EXPOSE 3982
