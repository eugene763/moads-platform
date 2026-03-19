import {FastifyInstance} from "fastify";

export interface CleanupExpiredMotrendDownloadsResult {
  scannedArtifacts: number;
  deletedArtifacts: number;
  deletedFiles: number;
}

export async function cleanupExpiredMotrendDownloads(
  app: FastifyInstance,
  input: {
    limit?: number;
    now?: Date;
  } = {},
): Promise<CleanupExpiredMotrendDownloadsResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));

  const artifacts = await app.prisma.moTrendDownloadArtifact.findMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
    orderBy: {
      expiresAt: "asc",
    },
    take: limit,
  });

  let deletedFiles = 0;
  for (const artifact of artifacts) {
    try {
      await app.firebase.bucket.file(artifact.storagePath).delete({ignoreNotFound: true});
      deletedFiles += 1;
    } catch (error) {
      app.log.warn({
        err: error,
        storagePath: artifact.storagePath,
        artifactId: artifact.id,
      }, "failed to delete expired motrend download artifact");
    }
  }

  if (artifacts.length > 0) {
    await app.prisma.moTrendDownloadArtifact.deleteMany({
      where: {
        id: {
          in: artifacts.map((artifact) => artifact.id),
        },
      },
    });
  }

  return {
    scannedArtifacts: artifacts.length,
    deletedArtifacts: artifacts.length,
    deletedFiles,
  };
}
