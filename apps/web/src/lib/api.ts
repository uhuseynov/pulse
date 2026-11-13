import type {
  AuthResponse,
  Channel,
  ChannelType,
  Message,
  MessagePage,
  ServerDetails,
  ServerSummary,
  User,
  VoiceCredentials,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Turns NestJS error bodies ({ message: string | string[] }) into one line. */
function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const { message } = body as { message: unknown };
    if (Array.isArray(message)) return message.join(". ");
    if (typeof message === "string") return message;
  }
  return fallback;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the API running?");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessage(body, `Request failed (${response.status})`),
    );
  }
  return body as T;
}

export const api = {
  register: (input: {
    email: string;
    username: string;
    displayName?: string;
    password: string;
  }) => request<AuthResponse>("/auth/register", { method: "POST", body: input }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input }),

  me: (token: string) => request<User>("/auth/me", { token }),

  listServers: (token: string) =>
    request<ServerSummary[]>("/servers", { token }),

  getServer: (token: string, serverId: string) =>
    request<ServerDetails>(`/servers/${serverId}`, { token }),

  createServer: (token: string, name: string) =>
    request<ServerDetails>("/servers", {
      method: "POST",
      token,
      body: { name },
    }),

  joinServer: (token: string, inviteCode: string) =>
    request<ServerDetails>("/servers/join", {
      method: "POST",
      token,
      body: { inviteCode },
    }),

  leaveServer: (token: string, serverId: string) =>
    request<void>(`/servers/${serverId}/leave`, { method: "POST", token }),

  deleteServer: (token: string, serverId: string) =>
    request<void>(`/servers/${serverId}`, { method: "DELETE", token }),

  createChannel: (
    token: string,
    serverId: string,
    name: string,
    type: ChannelType,
  ) =>
    request<Channel>(`/servers/${serverId}/channels`, {
      method: "POST",
      token,
      body: { name, type },
    }),

  deleteChannel: (token: string, channelId: string) =>
    request<void>(`/channels/${channelId}`, { method: "DELETE", token }),

  listMessages: (token: string, channelId: string, before?: string) =>
    request<MessagePage>(
      `/channels/${channelId}/messages${before ? `?before=${before}` : ""}`,
      { token },
    ),

  voiceConfig: () => request<{ enabled: boolean }>("/voice/config"),

  voiceToken: (token: string, channelId: string) =>
    request<VoiceCredentials>(`/channels/${channelId}/voice-token`, {
      method: "POST",
      token,
    }),

  sendMessage: (token: string, channelId: string, content: string) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: "POST",
      token,
      body: { content },
    }),
};
