/**
 * Public systems surfaces are deliberately data-driven. When this template is
 * moved to another client, update this object and leave the components alone.
 */
export const systemsConfig = {
  siteUrl: "https://www.avintph.com",
  github: {
    owner: "TitoDrewToo",
    repo: "AVInt",
    branch: "main",
  },
  vercel: {
    // Vercel accepts the project slug here; set VERCEL_PROJECT_ID when the
    // project uses a different identifier in the deployment environment.
    projectId: process.env.VERCEL_PROJECT_ID ?? "avintph",
  },
  supabase: {
    projectRef: "njbxbltgtxvhmcctdluz",
  },
} as const
