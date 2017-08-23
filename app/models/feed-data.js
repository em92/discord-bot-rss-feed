//my imports
const DiscordUtil = require("discordjs-util");

//external lib imports
const Dns = require("dns"); //for host resolution checking
const Url = require("url"); //for url parsing
const FeedRead = require("feed-read"); //for extracing new links from RSS feeds
const GetUrls = require("get-urls"); //for extracting urls from messages

module.exports = class FeedData {
	constructor({ url, channelName, roleName, cachedLinks, maxCacheSize }) {
		this.url = url;
		this.channelName = channelName;
		this.roleName = roleName;
		this.cachedLinks = cachedLinks || [];
		this.maxCacheSize = maxCacheSize || 10;

		this.cachedLinks.push = (...elements) => {
			const unique = elements
				.map(el => normaliseUrl(el)) //normalise all the urls
				.filter(el => !this.cachedLinks.includes(el)); //filter out any already cached
			Array.prototype.push.apply(this.cachedLinks, unique);

			if (this.cachedLinks.length > this.maxCacheSize)
				this.cachedLinks.splice(0, this.cachedLinks.length - this.maxCacheSize); //remove the # of elements above the max from the beginning
		};
	}

	/**
	 * Returns a promise providing all the links posted in the last 100 messages
	 * @param {Discord.Guild} guild The guild this feed belongs to
	 * @returns {Promise<string[]>} Links posted in last 100 messages
	 */
	updatePastPostedLinks(guild) {
		const channel = guild.channels.find(ch => ch.type === "text" && ch.name === this.channelName);

		return new Promise((resolve, reject) => {
			channel.fetchMessages({ limit: 100 })
				.then(messages => {
					new Map([...messages].reverse()).forEach(m => this.cachedLinks.push(...GetUrls(m.content))); //push all the links in each message into our links array
					resolve(this);
				})
				.catch(reject);
		});
	}

	check(guild) {
		Dns.resolve(Url.parse(this.url).host || "", err => { //check we can resolve the host, so we can throw an appropriate error if it fails
			if (err)
				DiscordUtil.dateError("Connection Error: Can't resolve host", err); //log our error if we can't resolve the host
			else
				FeedRead(this.url, (err, articles) => { //check the feed
					if (err)
						DiscordUtil.dateError(err);
					else {
						let latest = articles[0].link; //extract the latest link
						latest = normaliseUrl(latest); //standardise it a bit

						//if we don't have it cached already, cache it and callback
						if (!this.cachedLinks.includes(latest)) {
							this.cachedLinks.push(latest);

							const channel = guild.channels.find(ch => ch.type === "text" && ch.name.toLowerCase() === this.channelName.toLowerCase());
							const role = this.roleName ? guild.roles.find(role => role.name.toLowerCase() === this.roleName.toLowerCase()) : null;
							channel.send((role ? role + " " : "") + latest);
						}
					}
				});
		});
	}

	toString() {
		const blacklist = ["cachedLinks", "maxCacheSize"];
		return `\`\`\`JavaScript\n ${JSON.stringify(this, (k, v) => !blacklist.includes(k) ? v : undefined, "\t")} \`\`\``;
	}
};

function normaliseUrl(url) {
	url = url.replace("https://", "http://"); //cheaty way to get around http and https not matching

	if (Url.parse(url).host.includes("youtu")) //detect youtu.be and youtube.com - yes I know it's hacky
		url = url.split("&")[0]; //quick way to chop off stuff like &feature=youtube

	url = url.replace(/(www.)?youtube.com\/watch\?v=/, "youtu.be/"); //turn full url into share url

	return url;
}

function getUrls(str) {
	return str.match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);
}