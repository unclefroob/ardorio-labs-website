import { archiveCompany, archiveContact, addNote, addSuppression, assignContacts, bulkCompanies, createCompany, createContact, deleteList, deleteNote, deleteTemplate, editNote, importRows, linkCompany, linkContact, listAdd, listRemove, logLinkedIn, markVerified, removeSuppression, saveList, saveTemplate, setPermission, updateCompany, updateContact, updateCrel, updateRel } from './act/crm'
import { createDeal, markLost, markWon, moveStage, reopenDeal, updateDeal } from './act/deals'
import { correctClass, logCall, markThread, saveMeeting, markEmailSent, sendEmail, shareThread, simEvent, simulateReply } from './act/mail'
import { applyEnrichment, crossDismiss, introRequest, recStatus, recTask, refreshRecs, saveResearch, enrichLog } from './act/recs'
import { addKnownTech, reviewClosure, saveIntel } from './act/intel'
import { dupSequence, enrol, saveSequence, setEnrol, setSeqStatus } from './act/seq'
import { cancelTask, completeTask, createTask, deleteTask, skipEmailTask, snoozeTask, stopEmailing, updateTask } from './act/tasks'
import {
  advance, deleteGoal, deleteTeam, deleteView, readAll, readNotif, removeStage, resetClock, runSequences, sampleNotif, saveGoal, savePipeline, saveTeam,
  saveUser, saveView, setBiz, setClock, setDemo, setMailbox, setOrg, setSession, setTheme, setUserActive,
} from './act/admin'

export type { CompanyForm, ContactForm, ImportOptions, ImportResult, ImportRow, ListInput, NoteKind, SuppressionForm, TemplateInput } from './act/crm'
export type { DealForm, LostForm, WonForm } from './act/deals'
export type { CallForm, MeetingInput, MarkSentResult, SendEmailForm, SendResult, SimulateReplyOpts } from './act/mail'
export type { EnrolOpts, EnrolResult, SequenceInput } from './act/seq'
export type { CompleteOpts, EmailTaskResult, TaskInput } from './act/tasks'
export type { GoalInput, TeamInput, UserForm } from './act/admin'

/**
 * Every user-initiated mutation. Each action edits `S` in place and calls `commit()` last; saving
 * is the sync layer's job. Engine-initiated changes do not go through here.
 */
export const Act = {
  setSession, setTheme, advance, setClock, resetClock, runSequences,
  createCompany, updateCompany, linkCompany, updateRel, bulkCompanies, archiveCompany,
  addNote, editNote, deleteNote,
  createContact, linkContact, updateContact, updateCrel, setPermission, logLinkedIn, archiveContact, assignContacts,
  createDeal, updateDeal, moveStage, markWon, markLost, reopenDeal,
  createTask, updateTask, completeTask, snoozeTask, cancelTask, deleteTask,
  logCall, saveMeeting,
  sendEmail, markEmailSent, skipEmailTask, stopEmailing, markThread, shareThread,
  saveSequence, setSeqStatus, dupSequence, enrol, setEnrol,
  simulateReply, correctClass, simEvent,
  addSuppression, removeSuppression,
  recTask, recStatus, refreshRecs, introRequest, crossDismiss, saveResearch, saveIntel, reviewClosure, addKnownTech, applyEnrichment, enrichLog, markVerified,
  importRows, saveList, listAdd, listRemove, deleteList,
  saveTemplate, deleteTemplate, saveGoal, deleteGoal,
  saveUser, setUserActive, saveTeam, deleteTeam, savePipeline, removeStage, setMailbox, setOrg, setBiz, setDemo,
  readNotif, readAll, sampleNotif, saveView, deleteView,
}
