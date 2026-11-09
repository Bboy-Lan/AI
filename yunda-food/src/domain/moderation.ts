export const REVIEW_LABELS={pending:'待审核',approved:'已审核',changes:'需修改',blocked:'违规下架',deleted:'已删除',withdrawn:'已撤回'} as const
export type ReviewTag=keyof typeof REVIEW_LABELS
export type ReviewFields={reviewTag?:ReviewTag,reviewVersion?:number,reviewToken?:string,reviewReason?:string,adminEdited?:boolean}
export type ReviewKind='food'|'caution'|'topic'|'review'|'reply'
export const REVIEW_KINDS:Record<ReviewKind,string>={food:'推荐',caution:'黑榜',topic:'讨论主题',review:'评价',reply:'楼层回复'}
export type ReviewRecord=ReviewFields&{id:string,kind:ReviewKind,title:string,body:string,images:string[],author:string,createdAt:string,path:string,editPath:string,category:string,status:string,audit?:{operatorName?:string,action:string,reason:string,createdAt:string,before:any,after:any}[]}
