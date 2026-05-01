export default {
  fetch(_request: Request): Response {
    return new Response("clipdeck");
  }
} satisfies ExportedHandler;
