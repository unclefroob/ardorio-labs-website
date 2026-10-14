import { archiveCompany, archiveContact, restoreCompany, restoreContact, addNote, addSuppression, assignContacts, bulkCompanies, createCompany, createContact, deleteList, deleteNote, deleteTemplate, editNote, importRows, linkCompany, linkContact, listAdd, listRemove, logLinkedIn, markVerified, removeSuppression, saveList, saveTemplate, setPermission, updateCompany, updateContact, updateCrel, updateRel } from './act/crm'
import { addVariation, claimRetainerPeriod, confirmCpi, decideVariation, endTermEarly, markDelivered, retainerClaimProblem, saveMilestones, saveRetainer, setContract, setTermAgreement, setTermAutoDraft, termBaseline, waiveInstalment } from './act/billing'
import { recordWonDeal, recordWonOutcome } from './act/recordWon'
import { archiveDeal, createDeal, markLost, markWon, moveStage, reopenDeal, restoreDeal, updateDeal } from './act/deals'
import { correctClass, logCall, markThread, saveMeeting, markEmailSent, sendEmail, shareThread, simEvent, simulateReply } from './act/mail'
import { voidActivity } from './act/activities'
import { markTestAccount, unmarkTestAccount } from './act/rosterioTest'
import { cancelMeeting, deleteMeeting, markMeetingNoShow, rescheduleMeeting } from './act/meetings'
import { applyPhoneLookup } from './act/phone'
import { applyEnrichment, crossDismiss, introRequest, recStatus, recTask, refreshRecs, saveResearch, confirmResearchIdentity, enrichLog } from './act/recs'
import { addKnownTech, reviewClosure, saveIntel } from './act/intel'
import { archiveSequence, dupSequence, enrol, restoreSequence, saveSequence, setEnrol, setSeqStatus } from './act/seq'
import { cancelTask, completeTask, createTask, deleteTask, skipEmailTask, snoozeTask, stopEmailing, updateTask } from './act/tasks'
import {
  deleteGoal, deleteTeam, deleteView, readAll, readNotif, removeStage, runSequences, sampleNotif, saveGoal, savePipeline, saveTeam,
  saveUser, saveView, setBiz, setDemo, setMailbox, setOrg, setSession, setTheme, setUserActive,
} from './act/admin'

export type { CompanyForm, ContactForm, ImportOptions, ImportResult, ImportRow, ListInput, NoteKind, SuppressionForm, TemplateInput } from './act/crm'
export type { DealForm, LostForm, WonForm } from './act/deals'
export type { RecordWonInput, RecordWonResult, RecordWonSaved } from './act/recordWon'
export type { MeetingActResult } from './act/meetings'
export type { VoidResult } from './act/activities'
export type { BookedMeeting, CallForm, MeetingInput, MarkSentResult, SendEmailForm, SendResult, SimulateReplyOpts } from './act/mail'
export type { EnrolOpts, EnrolResult, SequenceInput } from './act/seq'
export type { CompleteOpts, EmailTaskResult, TaskInput } from './act/tasks'
export type { GoalInput, TeamInput, UserForm } from './act/admin'

/**
 * Every user-initiated mutation. Each action edits `S` in place and calls `commit()` last; saving
 * is the sync layer's job. Engine-initiated changes do not go through here.
 */
export const Act = {
  setSession, setTheme, runSequences,
  createCompany, updateCompany, linkCompany, updateRel, bulkCompanies, archiveCompany, restoreCompany,
  addNote, editNote, deleteNote,
  createContact, linkContact, updateContact, updateCrel, setPermission, logLinkedIn, archiveContact, restoreContact, assignContacts,
  saveMilestones, saveRetainer, claimRetainerPeriod, retainerClaimProblem, setContract, addVariation, decideVariation, markDelivered,
  setTermAgreement, termBaseline, confirmCpi, endTermEarly, setTermAutoDraft, waiveInstalment,
  createDeal, recordWonDeal, recordWonOutcome, updateDeal, moveStage, markWon, markLost, reopenDeal, archiveDeal, restoreDeal,
  createTask, updateTask, completeTask, snoozeTask, cancelTask, deleteTask,
  voidActivity,
  logCall, saveMeeting, cancelMeeting, markMeetingNoShow, rescheduleMeeting, deleteMeeting,
  sendEmail, markEmailSent, skipEmailTask, stopEmailing, markThread, shareThread,
  saveSequence, setSeqStatus, archiveSequence, restoreSequence, dupSequence, enrol, setEnrol,
  simulateReply, correctClass, simEvent,
  addSuppression, removeSuppression,
  markTestAccount, unmarkTestAccount,
  recTask, recStatus, refreshRecs, introRequest, crossDismiss, saveResearch, confirmResearchIdentity, saveIntel, reviewClosure, addKnownTech, applyEnrichment, applyPhoneLookup, enrichLog, markVerified,
  importRows, saveList, listAdd, listRemove, deleteList,
  saveTemplate, deleteTemplate, saveGoal, deleteGoal,
  saveUser, setUserActive, saveTeam, deleteTeam, savePipeline, removeStage, setMailbox, setOrg, setBiz, setDemo,
  readNotif, readAll, sampleNotif, saveView, deleteView,
}
