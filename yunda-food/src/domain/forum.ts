export const FORUM_CATEGORIES=['同乡交流','校园生活','吃喝吐槽'] as const
export type ForumStatus='public'|'hidden'|'withdrawn'
export type ForumAuthor={profileId:string,name:string,avatarKey:string,hometown:string}
export type ForumTopic={id:string,title:string,body:string,category:string,hometown:string,images:string[],status:ForumStatus,version:number,replyCount:number,sequence:string,createdAt:string,updatedAt:string,own:boolean,canEdit:boolean,reason:string,author:ForumAuthor}
export type ForumReply={id:string,topicId:string,topicTitle:string,topicUnavailable:boolean,body:string,status:ForumStatus,floor:number,replyToFloor:number,version:number,sequence:string,own:boolean,reason:string,createdAt:string,author:ForumAuthor}
export type ForumPage<T>={rows:T[],next?:string,afterFloor?:number}
export type ForumReport={id:string,target:'topic'|'reply',targetId:string,topicId:string,floor:number,status:'pending'|'resolved',reason:string,resolution:string,read:boolean,snapshot:{title:string,body:string,images?:string[],version?:number},created_at:string,sequence:string,reporter:ForumAuthor}
export function forumTopicError(value:{title?:string,body?:string,category?:string}){if((value.title?.trim().length||0)<2||(value.title?.trim().length||0)>60)return '请填写2～60字的话题标题。';if((value.body?.trim().length||0)<2||(value.body?.trim().length||0)>2000)return '请填写2～2000字的话题正文。';if(!FORUM_CATEGORIES.includes(value.category as typeof FORUM_CATEGORIES[number]))return '请选择话题分类。';return ''}
export function forumReplyError(body:string){return body.trim().length<2||body.trim().length>1000?'请填写2～1000字的回复内容。':''}
