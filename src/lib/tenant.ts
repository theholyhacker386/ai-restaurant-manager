import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * Get a database connection scoped to the current user's restaurant.
 * Every restaurant-specific API route should use this instead of getDb().
 *
 * Returns { sql, restaurantId } where restaurantId is guaranteed non-null.
 * Throws if the user isn't logged in or isn't tied to a restaurant.
 */
export async function getTenantDb() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantId = (session.user as any).restaurantId as string | undefined;

  if (!restaurantId) {
    throw new Error("No restaurant associated with this account");
  }

  return { sql: getDb(), restaurantId };
}

/**
 * Get a database connection for platform admin operations (no restaurant scope).
 * Only platform admins (Jennifer) should use this.
 *
 * Throws if the user isn't a platform admin.
 */
export async function getAdminDb() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPlatformAdmin = (session.user as any).isPlatformAdmin as boolean;

  if (!isPlatformAdmin) {
    throw new Error("Platform admin access required");
  }

  return { sql: getDb() };
}

/**
 * Get the current session's restaurant ID without a db connection.
 * Useful when you already have a sql instance.
 */
export async function getRestaurantId(): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restaurantId = (session.user as any).restaurantId as string | undefined;

  if (!restaurantId) {
    throw new Error("No restaurant associated with this account");
  }

  return restaurantId;
}
