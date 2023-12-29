import { Op } from "sequelize";
import { User, Collection, Document } from "@server/models";
import { APIContext } from "@server/types";
import documentCreator from "./documentCreator";

type Props = {
  /** The user who is creating the document */
  user: User;
  /** The document to duplicate */
  document: Document;
  /** The collection to add the duplicated document to */
  collection?: Collection | null;
  /** Override of the parent document to add the duplicate to */
  parentDocumentId?: string;
  /** Override of the duplicated document title */
  title?: string;
  /** Override of the duplicated document publish state */
  publish?: boolean;
  /** Whether to duplicate child documents */
  recursive?: boolean;
  ctx: APIContext;
};

export default async function documentDuplicator({
  user,
  document,
  collection,
  parentDocumentId,
  title,
  publish,
  recursive,
  ctx,
}: Props): Promise<Document[]> {
  const newDocuments: Document[] = [];
  const sharedProperties = {
    user,
    collectionId: collection?.id,
    publish: publish ?? !!document.publishedAt,
    ctx,
  };

  const duplicated = await documentCreator({
    parentDocumentId: parentDocumentId ?? document.parentDocumentId,
    emoji: document.emoji,
    template: document.template,
    title: title ?? document.title,
    text: document.text,
    ...sharedProperties,
  });

  duplicated.collection = collection;
  newDocuments.push(duplicated);

  async function duplicateChildDocuments(
    original: Document,
    duplicated: Document
  ) {
    const childDocuments = await original.findChildDocuments(
      {
        archivedAt: original.archivedAt
          ? {
              [Op.ne]: null,
            }
          : {
              [Op.eq]: null,
            },
      },
      ctx
    );

    for (const childDocument of childDocuments) {
      const duplicatedChildDocument = await documentCreator({
        parentDocumentId: duplicated.id,
        emoji: childDocument.emoji,
        title: childDocument.title,
        text: childDocument.text,
        ...sharedProperties,
      });

      duplicatedChildDocument.collection = collection;
      newDocuments.push(duplicatedChildDocument);
      await duplicateChildDocuments(childDocument, duplicatedChildDocument);
    }
  }

  if (recursive && !document.template) {
    await duplicateChildDocuments(document, duplicated);
  }

  return newDocuments;
}
