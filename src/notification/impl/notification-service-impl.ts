import {inject, injectable} from 'inversify';
import {NotificationService} from '../def/notification-service';
import {Observable} from 'rxjs';
import {Notification, NotificationFilterCriteria} from '../def/requests';
import {InjectionTokens} from '../../injection-tokens';
import {DbService} from '../../db';
import {NotificationEntry} from '../db/schema';
import {NotificationHandler} from '../handler/notification-handler';
import { SharedPreferences } from '../../util/shared-preferences';
import COLUMN_NAME_NOTIFICATION_JSON = NotificationEntry.COLUMN_NAME_NOTIFICATION_JSON;
import { CodePush } from '../../preference-keys';

@injectable()
export class NotificationServiceImpl implements NotificationService {

    constructor(
        @inject(InjectionTokens.DB_SERVICE) private dbService: DbService,
        @inject(InjectionTokens.SHARED_PREFERENCES) private sharedPreferences: SharedPreferences
    ) {
    }

    addNotification(notification: Notification): Observable<boolean> {
        if (notification.actionData && notification.actionData.actionType === 'codePush' && notification.actionData.deploymentKey ) {
            this.sharedPreferences.putString(CodePush.DEPLOYMENT_KEY, notification.actionData.deploymentKey);
        }
        return this.dbService.read({
            table: NotificationEntry.TABLE_NAME,
            selection: `${NotificationEntry.COLUMN_NAME_MESSAGE_ID}= ?`,
            selectionArgs: [notification.id.toString()],
            limit: '1'
        }).mergeMap((notificationInDb: NotificationEntry.SchemaMap[]) => {
            if (notificationInDb && notificationInDb.length) {
                return this.dbService.update({
                    table: NotificationEntry.TABLE_NAME,
                    selection: `${NotificationEntry.COLUMN_NAME_MESSAGE_ID}= ?`,
                    selectionArgs: [notification.id.toString()],
                    modelJson: NotificationHandler.constructNotificationDBModel(notification)
                }).mapTo(true);
            } else {
                return this.dbService.insert({
                    table: NotificationEntry.TABLE_NAME,
                    modelJson: NotificationHandler.constructNotificationDBModel(notification)
                }).mapTo(true);
            }
        });
    }

    deleteNotification(messageId?: number): Observable<boolean> {
        const query = `DELETE FROM ${NotificationEntry.TABLE_NAME} `
            .concat(messageId ? `WHERE ${NotificationEntry.COLUMN_NAME_MESSAGE_ID} = ${messageId}` : '');
        return this.dbService.execute(query).mapTo(true);
    }

    getAllNotifications(criteria: NotificationFilterCriteria): Observable<Notification[]> {
        return this.dbService.read(NotificationHandler.getFilterForNotification(criteria))
            .map((notificationInDb: NotificationEntry.SchemaMap[]) => {
                return notificationInDb.map((notification) => {
                    const notificationRes: Notification = JSON.parse(notification[COLUMN_NAME_NOTIFICATION_JSON]!);
                    notificationRes.isRead = notification[NotificationEntry.COLUMN_NAME_IS_READ]!;
                    return notificationRes;
                });
            });
    }

    updateNotification(notification: Notification): Observable<boolean> {
        return this.dbService.read({
            table: NotificationEntry.TABLE_NAME,
            selection: `${NotificationEntry.COLUMN_NAME_MESSAGE_ID}= ?`,
            selectionArgs: [notification.id.toString()],
            limit: '1'
        }).mergeMap((notificationInDb: NotificationEntry.SchemaMap[]) => {
            if (notificationInDb && notificationInDb.length) {
                return this.dbService.update({
                    table: NotificationEntry.TABLE_NAME,
                    selection: `${NotificationEntry.COLUMN_NAME_MESSAGE_ID}= ?`,
                    selectionArgs: [notification.id.toString()],
                    modelJson: NotificationHandler.constructNotificationDBModel(notification)
                }).mapTo(true);
            } else {
                return Observable.of(false);
            }
        });
    }

}
