export interface SessionLoginPayload {
  idToken: string;
}

export interface SessionLoginResult {
  user: {
    id: string;
    firebaseUid: string;
    email: string | null;
  };
  account: {
    id: string;
  };
  product: {
    code: string;
  };
  createdMembership: boolean;
  grantedTestCredits: boolean;
}

export function shouldShowGiftNotice(result: Pick<SessionLoginResult, "grantedTestCredits">): boolean {
  return result.grantedTestCredits === true;
}

export async function sessionLogin(
  baseUrl: string,
  payload: SessionLoginPayload,
): Promise<SessionLoginResult> {
  const response = await fetch(new URL("/auth/session-login", baseUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`session-login failed with ${response.status}`);
  }

  return await response.json() as SessionLoginResult;
}
