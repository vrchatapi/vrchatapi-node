import {createClient as _createClient, Client, Options as _Options} from "@hey-api/client-fetch"
export * from "./__generated"

import { ClientApi as CacheClient } from "@hapi/catbox"
import { Engine as MemoryCache } from "@hapi/catbox-memory"
import { getCurrentUser, verify2Fa, verify2FaEmailCode, verifyRecoveryCode, type CurrentUser, type Error } from "./__generated";
import {TOTP} from "totp-generator"

import {debug} from "debug"

const log = debug("vrchat")

type _ClientOptions = Parameters<typeof _createClient>[0];

export type LoginCredentials = {
	username: string;
	password: string;
	/**
	 * The secret key for two-factor authentication.
	 * Equivalent to ``twoFactorCode: () => TOTP.generate(twoFactorSecret).otp``.
	 */
	twoFactorSecret?: string;
	/**
	 * If provided, this function will be called to generate the two-factor authentication code. It overrides ``twoFactorSecret`` if both are provided, causing ``twoFactorSecret`` to be ignored.
	 * @returns The two-factor authentication code.
	 */
	twoFactorCode?: () => string | Promise<string>
}

export type ClientOptions = {
	application: {
		name: string
		version: string | number
		contact: string
	}
	credentials?: CacheClient<unknown>
} & Omit<_ClientOptions, "global" | "body" | "bodySerializer" | "method" | "parseAs" | "querySerializer" | "mode" | "credentials">

type Cookie = {
	name: string;
	value: string;
	expires: number | null;
	options: Record<string, string>;
}

function deseralizeCookie(cookie: string): Cookie {
	const [name, ...rest] = cookie.split("=");
	const [value, ..._options] = rest.join("=").split(";");

	const options = Object.fromEntries(_options.map((option) => {
		const [name, value] = option.split("=");
		return [name.trim().toLowerCase(), value];
	})) as Record<string, string>;

	const expires = options["max-age"]
		? Date.now() + Number(options["max-age"]) * 1000
		: options.expires
			? new Date(options.expires).getTime()
			: null;

	return { name, value, expires, options }
}

function serializeCookie({ name, value }: Pick<Cookie, "name" | "value">): string {
	return `${name}=${value}`;
}

function serializeCookies(cookies: Record<string, Omit<Cookie, "name">>): string {
	return Object.entries(cookies)
		.map(([name, { value }]) => serializeCookie({ name, value }))
		.join("; ");
}

function issue(message: string, status_code: number) {
	return {
		message,
		status_code,
		toString: () => message
	} as Error["error"]
}

export class VRChat {
	public client: Client;
	public credentials: CacheClient<unknown>;

	public constructor({ application, credentials = new MemoryCache(), ...options }: ClientOptions) {
		this.credentials = credentials;

		// Optimistically connect, but don't wait for it to finish.
		void credentials.start();

		this.client = _createClient({
			...options,
			global: false,
			baseUrl: "https://vrchat.com/api/1/",
			headers: {
				...options.headers,
				"user-agent": `${application.name}/${application.version} (${application.contact}) via VRChat.js v0`
			}
		});

		const getCookies = async ({ credentials, url }: Pick<Request, "credentials" | "url">): Promise<Record<string, Omit<Cookie, "name">>> => {
			if (credentials === "omit") return {};
			const { origin } = new URL(url);

			if (!this.credentials.isReady()) await this.credentials.start();
			const value = await this.credentials.get({ segment: origin, id: "cookies" });
			if (!value) return {};

			const { item: _cookies } = value as { item: Record<string, Omit<Cookie, "name">> }

			const cookies = Object.fromEntries(
				Object.entries(_cookies)
					.filter(([, { expires }]) => expires ? expires <= Date.now() : true)
			)

			log("getCookies", { origin, cookies })
			return cookies;
		}

		const saveCookies = async ({ headers, url }: Pick<Response, "headers" | "url">) => {
			const { origin } = new URL(url);

			const cookies = {
				...await getCookies({ credentials: "include", url }),
				...Object.fromEntries(headers.getSetCookie().map((cookie) => {
					const { name, ...value} = deseralizeCookie(cookie);
					return [name, value];
				}))
			};

			const values = Object.values(cookies);
			if (!values.length) return;

			log("saveCookies", { origin, cookies });

			const { expires } = values.reduce((a, b) =>
				(a.expires?.valueOf() || 0) > (b.expires?.valueOf() || 0) ? a : b
			);

			if (!this.credentials.isReady()) await this.credentials.start();
			await this.credentials.set({
				segment: origin,
				id: "cookies"
			}, cookies, expires ? Math.max(expires - Date.now(), 0) : Infinity)
		}
		
		const { interceptors } = this.client;

		interceptors.request.use(async (request, options) => {
			if (!log.enabled) return request;

			const clone = request.clone();
			log(
				clone.method, 
				clone.url.replace(options.baseUrl || "", ""), 
				await clone.json().catch(() => clone.text())
			);

			return request;
		})

		interceptors.request.use(async (request) => {
			const cookies = await getCookies(request)
			
			request.headers.set("cookie", serializeCookies(cookies));

			return request;
		})

		interceptors.response.use(async (response) => {
			await saveCookies(response);
			return response;
		})

		interceptors.response.use(async (response, request, options) => {
			if (!log.enabled) return response;

			const clone = response.clone();
			log(
				clone.status,
				clone.statusText,
				request.method,
				request.url.replace(options.baseUrl || "", ""),
				await clone.json()
			)

			return response;
		})
	}

	public async login({ username, password, twoFactorSecret, twoFactorCode }: LoginCredentials) {
		const { data, error, request, response } = await getCurrentUser({
			client: this.client,
			credentials: "omit",
			headers: {
				authorization: `Basic ${btoa(`${encodeURIComponent(username)}:${encodeURIComponent(password)}`)}`
			}
		});

		if (error) return { data: undefined, error, request, response };

		if (data && "requiresTwoFactorAuth" in data) {
			if (twoFactorSecret && !twoFactorCode) 
				twoFactorCode = () => TOTP.generate(twoFactorSecret).otp;

			if (!twoFactorCode) return { 
				data: undefined, 
				error: issue("Missing two-factor authentication, incomplete login flow", 400),
				request, 
				response
			};

			const code = await twoFactorCode();

			const factors = await Promise.all([
				code.length === 6 ? verify2Fa : undefined, 
				// verify2FaEmailCode, 
				// verifyRecoveryCode
			].map((fn) => fn?.({ 
				client: this.client, 
				body: { code }
			})))

			const verified = factors.find((value) => value?.data?.verified)?.data?.verified ?? false
			const tooManyAttempts = factors.find((value) => value?.response.status === 429)?.response.status === 429 ?? false;

			if (!verified) return {
				data: undefined,
				error: tooManyAttempts
					? issue("Too many attempts, try again later", 429)
					: issue("Invalid two-factor authentication code", 400),
				request, 
				response
			};

			return getCurrentUser({ client: this.client });
		}

		return {
			data,
			error: undefined,
			request,
			response
		};
	}
}