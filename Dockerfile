FROM node:9

USER root

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get -y update \
	&& apt-get -y upgrade \
	&& apt-get install ca-certificates \
	&& apt-get -y update \
	&& echo "deb http://ftp.uk.debian.org/debian jessie-backports main" | tee -a /etc/apt/sources.list \
 	&& apt-get -y update \
	&& apt-get install -y ffmpeg \
	&& npm install pm2 -g \
	&& mkdir -p /home/nodejs/app 

WORKDIR /home/nodejs/app

COPY package.json /home/nodejs/app

RUN npm install --production

COPY . /home/nodejs/app

CMD [ "pm2-runtime", "start", "/home/nodejs/app/pm2.json" ]

EXPOSE 3991
