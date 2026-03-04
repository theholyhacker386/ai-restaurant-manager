"use server";

export async function signupAction(formData: {
  name: string;
  restaurantName: string;
  email: string;
  password: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.error || "Something went wrong." };
  }

  return { success: true };
}
