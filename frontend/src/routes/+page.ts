import { safeRPC } from "$lib/api-client";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({params}) => {
  const {data, error} = await safeRPC.projects.getProjectsForUser();
  return {
    projects: data
  };
}