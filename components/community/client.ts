import { appPath } from "@/lib/paths";

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(appPath("/api/" + path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后再试");
  return data;
}
