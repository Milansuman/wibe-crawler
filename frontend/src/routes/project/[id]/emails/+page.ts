import type {PageLoad} from "./$types";
import { safeRPC } from "$lib/api-client";

export const load: PageLoad = async ({params}) => {
  const {data: project, error} = await safeRPC.projects.getProjectById({
    projectId: params.id!
  });

  const {data: emails} = await safeRPC.urls.getEmailsForProject({
    projectId: params.id!
  });

  return {
    ...project,
    emails: emails || []
  };
}
