import {Content, HierarchyInfo} from '../def/content';
import {ChildContent} from '../def/response';
import {DbService} from '../../db';
import {ContentUtil} from '../util/content-util';
import {ContentEntry} from '../db/schema';
import {ChildContents, MimeType, State} from '../util/content-constants';
import {GetContentDetailsHandler} from './get-content-details-handler';
import {Stack} from '../util/stack';
import {ContentMapper} from '../util/content-mapper';
import {ArrayUtil} from '../../util/array-util';
import {FileService} from '../../util/file/def/file-service';
import { FileName } from './../util/content-constants';

export class ChildContentsHandler {

    constructor(private dbService: DbService,
                private getContentDetailsHandler: GetContentDetailsHandler,
                private fileService: FileService) {
    }

    public async fetchChildrenOfContent(contentInDb: ContentEntry.SchemaMap,
                                        childContentsMap,
                                        currentLevel: number,
                                        level: number,
                                        sourceInfoList?: HierarchyInfo[]): Promise<Content> {
        const content: Content = ContentMapper.mapContentDBEntryToContent(contentInDb);
        const childContentModels: ContentEntry.SchemaMap[] =
            await this.getSortedChildrenList(contentInDb[ContentEntry.COLUMN_NAME_LOCAL_DATA], ChildContents.ALL, childContentsMap);
        if (childContentModels && childContentModels.length) {
            let hierarchyInfoList: HierarchyInfo[] = [];
            hierarchyInfoList = hierarchyInfoList.concat(sourceInfoList!);
            hierarchyInfoList.push({
                identifier: contentInDb[ContentEntry.COLUMN_NAME_IDENTIFIER],
                contentType: contentInDb[ContentEntry.COLUMN_NAME_CONTENT_TYPE]
            });
            content.hierarchyInfo = hierarchyInfoList!;

            if (level === -1 || currentLevel <= level) {
                const childContents: Content[] = [];
                for (const element of childContentModels) {
                    const childContentModel = element as ContentEntry.SchemaMap;
                    const childContent: Content = await this.fetchChildrenOfContent(childContentModel,
                        childContentsMap,
                        currentLevel + 1,
                        level,
                        hierarchyInfoList);
                    childContents.push(childContent);
                }
                content.children = childContents;
            }
        } else {
            content.hierarchyInfo = sourceInfoList;
        }
        return content;
    }

    async getContentsKeyList(contentInDb: ContentEntry.SchemaMap): Promise<string[]> {
        const contentKeyList: string[] = [];
        const contentStack = new Stack<ContentEntry.SchemaMap>();
        const parentChildRelation: string[] = [];
        let key = '';
        contentStack.push(contentInDb);
        let node: ContentEntry.SchemaMap;
        while (!contentStack.isEmpty()) {
            node = contentStack.pop();
            if (ContentUtil.hasChildren(node[ContentEntry.COLUMN_NAME_LOCAL_DATA])) {
                const childContentsMap: Map<string, ContentEntry.SchemaMap> = new Map<string, ContentEntry.SchemaMap>();
                // const data = JSON.parse(node[ContentEntry.COLUMN_NAME_LOCAL_DATA]);
                // const childIdentifiers = data.childNodes;
                const childIdentifiers = await this.getChildIdentifiersFromManifest(node[ContentEntry.COLUMN_NAME_PATH]!);
                console.log('childIdentifiers', childIdentifiers);

                const query = `SELECT * FROM ${ContentEntry.TABLE_NAME}
                                WHERE ${ContentEntry.COLUMN_NAME_IDENTIFIER}
                                IN (${ArrayUtil.joinPreservingQuotes(childIdentifiers)})`;
                const childContents = await this.dbService.execute(query).toPromise();
                childContents.forEach(element => {
                    childContentsMap.set(element.identifier, element);
                });
                const childContentsInDb: ContentEntry.SchemaMap[] = await this.getSortedChildrenList(
                    node[ContentEntry.COLUMN_NAME_LOCAL_DATA],
                    ChildContents.ALL,
                    childContentsMap);
                childContentsInDb.forEach((childContentInDb) => {
                    contentStack.push(childContentInDb);
                    parentChildRelation.push(node[ContentEntry.COLUMN_NAME_IDENTIFIER].concat('/',
                        childContentInDb[ContentEntry.COLUMN_NAME_IDENTIFIER]));
                });

            }

            if (!key) {
                key = node[ContentEntry.COLUMN_NAME_IDENTIFIER];
            } else {
                let tempKey: string;
                for (let i: number = key.split('/').length - 1; i >= 0; i--) {
                    const immediateParent: string = key.split('/')[i];
                    if (ArrayUtil.contains(parentChildRelation, immediateParent.concat('/', node[ContentEntry.COLUMN_NAME_IDENTIFIER]))) {
                        break;
                    } else {
                        key = key.substring(0, key.lastIndexOf('/'));
                    }
                }
                if (MimeType.COLLECTION.valueOf() === node[ContentEntry.COLUMN_NAME_MIME_TYPE]) {
                    key = key + '/' + node[ContentEntry.COLUMN_NAME_IDENTIFIER];
                } else {
                    tempKey = key + '/' + node[ContentEntry.COLUMN_NAME_IDENTIFIER];
                    contentKeyList.push(tempKey);
                }
            }


        }
        return contentKeyList;
    }

    async getContentFromDB(hierarchyInfoList: HierarchyInfo[], identifier: string): Promise<Content> {
        const nextContentHierarchyList: HierarchyInfo[] = [];
        let nextContent;
        // const nextContentIdentifier = this.getPreviousContentIdentifier(hierarchyInfoList, currentIdentifier, contentKeyList);
        if (identifier) {
            const nextContentIdentifierList: string[] = identifier.split('/');
            const idCount: number = nextContentIdentifierList.length;
            let isAllHierarchyContentFound = true;
            for (let i = 0; i < (idCount - 1); i++) {
                const contentInDb = await this.getContentDetailsHandler
                    .fetchFromDB(nextContentIdentifierList[i]).toPromise();
                if (contentInDb) {
                    nextContentHierarchyList.push({
                        'identifier': contentInDb[ContentEntry.COLUMN_NAME_IDENTIFIER],
                        'contentType': contentInDb[ContentEntry.COLUMN_NAME_CONTENT_TYPE]
                    });
                } else {
                    isAllHierarchyContentFound = false;
                    break;
                }
            }
            if (isAllHierarchyContentFound) {
                const nextContentInDb = await this.getContentDetailsHandler.fetchFromDB(
                    nextContentIdentifierList[idCount - 1]).toPromise();
                if (nextContentInDb) {
                    nextContent = ContentMapper.mapContentDBEntryToContent(nextContentInDb);
                    nextContent.hierarchyInfo = nextContentHierarchyList;
                    nextContent.rollup = ContentUtil.getContentRollup(nextContent.identifier, nextContent.hierarchyInfo);
                }
            }
        }
        return nextContent;
    }

    getNextContentIdentifier(hierarchyInfoList: HierarchyInfo[],
                             currentIdentifier: string,
                             contentKeyList: string[]): string {
        let currentIdentifiers = '';
        let nextContentIdentifier;
        hierarchyInfoList.forEach((hierarchyItem) => {
            if (!currentIdentifiers) {
                currentIdentifiers = hierarchyItem.identifier;
            } else {
                currentIdentifiers = currentIdentifiers.concat('/', hierarchyItem.identifier);
            }
        });
        currentIdentifiers = currentIdentifiers.concat('/', currentIdentifier);
        const indexOfCurrentContentIdentifier: number = contentKeyList.indexOf(currentIdentifiers);
        if (indexOfCurrentContentIdentifier > 0) {
            nextContentIdentifier = contentKeyList[indexOfCurrentContentIdentifier - 1];
        }
        return nextContentIdentifier;
    }

    public getPreviousContentIdentifier(hierarchyInfoList: HierarchyInfo[],
                                        currentIdentifier: string,
                                        contentKeyList: string[]): string {

        let currentIdentifiers = '';
        let previousContentIdentifier;
        hierarchyInfoList.forEach((hierarchyItem) => {
            if (!currentIdentifiers) {
                currentIdentifiers = hierarchyItem.identifier;
            } else {
                currentIdentifiers = currentIdentifiers.concat('/', hierarchyItem.identifier);
            }
        });
        currentIdentifiers = currentIdentifiers.concat('/', currentIdentifier);
        const indexOfCurrentContentIdentifier = contentKeyList.indexOf(currentIdentifiers);
        if (indexOfCurrentContentIdentifier !== -1 && indexOfCurrentContentIdentifier < (contentKeyList.length - 1)) {
            previousContentIdentifier = contentKeyList[indexOfCurrentContentIdentifier + 1];
        }
        return previousContentIdentifier;
    }

    private getSortedChildrenList(localData: string, level: number, childContentsMap): ContentEntry.SchemaMap[] {
        const data = JSON.parse(localData);
        let childContents: ChildContent[] = data.children;
        if (!childContents || !childContents.length) {
            return [];
        }

        childContents = childContents.sort((childContent1, childContent2) => {
            return (childContent1.index - childContent2.index);
        });

        let childContentsFromDB: ContentEntry.SchemaMap[] = [];
        childContents.forEach(childContent => {
            childContentsFromDB.push(childContentsMap.get(childContent.identifier));
        });

        switch (level) {
            case ChildContents.DOWNLOADED.valueOf():
                // filter = ' AND ' + ContentEntry.COLUMN_NAME_CONTENT_STATE + '=\'' + State.ARTIFACT_AVAILABLE + '\'';
                childContentsFromDB = childContentsFromDB
                                        .filter((c) => c[ContentEntry.COLUMN_NAME_CONTENT_STATE] = State.ARTIFACT_AVAILABLE);
                break;
            case ChildContents.SPINE.valueOf():
                // filter = ' AND ' + ContentEntry.COLUMN_NAME_CONTENT_STATE + '=\'' + State.ONLY_SPINE + '\'';
                childContentsFromDB = childContentsFromDB.filter((c) => c[ContentEntry.COLUMN_NAME_CONTENT_STATE] = State.ONLY_SPINE);
                break;
            case ChildContents.ALL.valueOf():
            default:
                break;
        }

        return childContentsFromDB;

    }

    public async getChildIdentifiersFromManifest (path: string) {
        const manifestPath = 'file:///' + path;
        const childIdentifiers: string[] = [];
        await this.fileService.readAsText(manifestPath, FileName.MANIFEST.valueOf())
        .then(async (fileContents) => {
            console.log('fileContents', JSON.parse(fileContents));
            const childContents = JSON.parse(fileContents).archive.items;
            childContents.shift();
            childContents.forEach(element => {
                childIdentifiers.push(element.identifier);
            });
            return childIdentifiers;
        }).catch((err) => {
            console.log('getChildIdentifiersFromManifest err', err);
        });
        return childIdentifiers;
    }


}
