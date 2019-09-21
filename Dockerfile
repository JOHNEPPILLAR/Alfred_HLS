FROM node:12

USER root

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get install ca-certificates \
	&& apt-get -y update \
	&& apt-get install -y ffmpeg \
	&& mkdir -p /home/nodejs/app 

WORKDIR /home/nodejs/app

COPY . /home/nodejs/app

RUN npm update \
	&& npm install --production

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3982
