import type {PageLoad} from "./$types";
import { safeRPC } from "$lib/api-client";

export const load: PageLoad = async ({params}) => {
  const {data: project, error} = await safeRPC.projects.getProjectById({
    projectId: params.id!
  });

  const {data: statistics} = await safeRPC.projects.getProjectStatistics({
    projectId: params.id!
  });

  return {
    project,
    statistics: statistics || null
  };
}
