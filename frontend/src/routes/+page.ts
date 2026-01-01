import { orpc } from '$lib/api-client';

export async function load() {
  try {
    const projects = await orpc.projects.getProjects();
    return {
      projects
    };
  } catch (error) {
    console.error('Failed to load projects:', error);
    return {
      projects: []
    };
  }
}
