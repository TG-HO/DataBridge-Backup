"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { executeRawQueryOnConnection } from "@/lib/query-runner";

export interface PinWidgetInput {
  dashboardId?: string;
  newDashboardName?: string;
  title: string;
  description?: string;
  chartType: string;
  chartConfig: string | object;
  rawQuery: string;
  connectionId: string;
  cachedData?: unknown[];
}

export interface WidgetLayoutUpdate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Retrieves all dashboards for the authenticated user's organization.
 * Auto-initializes a Default Dashboard if none exists yet.
 */
export async function getDashboards() {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized", dashboards: [] };
  }

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id },
  });

  if (!membership) {
    return { success: false, error: "No organization membership found.", dashboards: [] };
  }

  let dashboards = await prisma.dashboard.findMany({
    where: { orgId: membership.orgId },
    orderBy: { createdAt: "asc" },
  });

  // Auto-seed default dashboard if organization has none
  if (dashboards.length === 0) {
    const defaultDash = await prisma.dashboard.create({
      data: {
        orgId: membership.orgId,
        name: "Main Operations Dashboard",
        description: "Primary analytics and cross-database performance workspace.",
      },
    });
    dashboards = [defaultDash];
  }

  return { success: true, dashboards };
}

/**
 * Creates a new dashboard within the user's organization.
 */
export async function createDashboard(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id },
  });

  if (!membership) {
    return { success: false, error: "No organization found." };
  }

  const cleanName = name.trim();
  if (!cleanName) {
    return { success: false, error: "Dashboard name is required." };
  }

  const newDash = await prisma.dashboard.create({
    data: {
      orgId: membership.orgId,
      name: cleanName,
      description: description?.trim() || null,
    },
  });

  revalidatePath("/dashboard");
  return { success: true, dashboard: newDash };
}

/**
 * Fetches a dashboard and all its pinned widgets.
 */
export async function getDashboardWithWidgets(dashboardId?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized", dashboard: null, widgets: [] };
  }

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id },
  });

  if (!membership) {
    return { success: false, error: "No organization found.", dashboard: null, widgets: [] };
  }

  let targetDashboardId = dashboardId;

  if (!targetDashboardId) {
    const firstDash = await prisma.dashboard.findFirst({
      where: { orgId: membership.orgId },
      orderBy: { createdAt: "asc" },
    });
    if (!firstDash) {
      // Auto-create default
      const created = await prisma.dashboard.create({
        data: {
          orgId: membership.orgId,
          name: "Main Operations Dashboard",
          description: "Primary analytics and cross-database performance workspace.",
        },
      });
      targetDashboardId = created.id;
    } else {
      targetDashboardId = firstDash.id;
    }
  }

  const dashboard = await prisma.dashboard.findFirst({
    where: {
      id: targetDashboardId,
      orgId: membership.orgId,
    },
    include: {
      widgets: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!dashboard) {
    return { success: false, error: "Dashboard not found.", dashboard: null, widgets: [] };
  }

  return {
    success: true,
    dashboard,
    widgets: dashboard.widgets,
  };
}

/**
 * Pins a chart widget to a dashboard (FR-12).
 */
export async function pinWidgetToDashboard(input: PinWidgetInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized: Active session required." };
  }

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id },
  });

  if (!membership) {
    return { success: false, error: "No organization membership found." };
  }

  let finalDashboardId = input.dashboardId;

  // If user opted to create a new dashboard on the fly
  if (!finalDashboardId && input.newDashboardName) {
    const newDash = await prisma.dashboard.create({
      data: {
        orgId: membership.orgId,
        name: input.newDashboardName.trim(),
        description: "Created via Chart Pinning",
      },
    });
    finalDashboardId = newDash.id;
  }

  if (!finalDashboardId) {
    // Find or create default dashboard
    let defaultDash = await prisma.dashboard.findFirst({
      where: { orgId: membership.orgId },
    });
    if (!defaultDash) {
      defaultDash = await prisma.dashboard.create({
        data: {
          orgId: membership.orgId,
          name: "Main Operations Dashboard",
        },
      });
    }
    finalDashboardId = defaultDash.id;
  }

  // Count existing widgets to calculate initial layout position
  const widgetCount = await prisma.dashboardWidget.count({
    where: { dashboardId: finalDashboardId },
  });

  const defaultLayout = {
    x: (widgetCount * 6) % 12,
    y: Math.floor(widgetCount / 2) * 4,
    w: 6,
    h: 4,
    minW: 4,
    minH: 3,
  };

  const stringifiedConfig =
    typeof input.chartConfig === "string"
      ? input.chartConfig
      : JSON.stringify(input.chartConfig || {});

  const newWidget = await prisma.dashboardWidget.create({
    data: {
      dashboardId: finalDashboardId,
      title: input.title || "Pinned Analytics Widget",
      description: input.description || null,
      chartType: String(input.chartType || "BAR").toUpperCase(),
      chartConfig: stringifiedConfig,
      rawQuery: input.rawQuery || "",
      connectionId: input.connectionId || "",
      layout: JSON.stringify(defaultLayout),
    },
  });

  revalidatePath("/dashboard");
  return {
    success: true,
    message: `Chart successfully pinned to dashboard!`,
    widget: newWidget,
  };
}

/**
 * Updates the grid layout coordinates for widgets after user drag/resize (FR-12).
 */
export async function updateWidgetLayouts(
  dashboardId: string,
  layouts: WidgetLayoutUpdate[]
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    for (const item of layouts) {
      const existing = await prisma.dashboardWidget.findUnique({
        where: { id: item.id },
        select: { layout: true },
      });

      let currentLayout = {};
      try {
        if (existing?.layout) currentLayout = JSON.parse(existing.layout);
      } catch {}

      const updatedLayout = {
        ...currentLayout,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      };

      await prisma.dashboardWidget.update({
        where: { id: item.id },
        data: { layout: JSON.stringify(updatedLayout) },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[updateWidgetLayouts] Failed to save grid coordinates:", err);
    return { success: false, error: "Failed to persist layout changes." };
  }
}

/**
 * Deletes a widget from a dashboard.
 */
export async function deleteWidget(widgetId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  await prisma.dashboardWidget.delete({
    where: { id: widgetId },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Re-runs the stored rawQuery against the target connection (FR-12 Live Data Refresh).
 */
export async function refreshWidgetData(widgetId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" };
  }

  const widget = await prisma.dashboardWidget.findUnique({
    where: { id: widgetId },
  });

  if (!widget) {
    return { success: false, error: "Widget record not found." };
  }

  if (!widget.connectionId || !widget.rawQuery) {
    return {
      success: false,
      error: "This widget does not have a linked connection or query specification.",
    };
  }

  const conn = await prisma.dbConnection.findUnique({
    where: { id: widget.connectionId },
  });

  if (!conn) {
    return { success: false, error: "Linked database connection no longer exists." };
  }

  try {
    const records = await executeRawQueryOnConnection(conn, widget.rawQuery);
    return {
      success: true,
      data: records,
      refreshedAt: new Date().toLocaleTimeString(),
    };
  } catch (err) {
    console.error(`[refreshWidgetData] Error executing query for widget ${widgetId}:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to execute database query.",
    };
  }
}
