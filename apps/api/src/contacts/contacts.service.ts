import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ConflictStatus } from '@gammaray/core'
import { ContactInput } from './contact.model'

export interface ContactPushResult {
  conflict: boolean
  contact: ContactEntity | null
  serverVersion?: number
  serverData?: Record<string, unknown>
}

// Contacts are a shared, globally-visible dataset — no per-user scoping, no
// foreign keys. Read + Create implemented; Update/Delete come next.
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ContactRevisionEntity)
    private readonly revisions: Repository<ContactRevisionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  listContacts(): Promise<ContactEntity[]> {
    return this.contacts.find({ order: { updatedAt: 'DESC' } })
  }

  getContact(id: string): Promise<ContactEntity | null> {
    return this.contacts.findOneBy({ id })
  }

  getContactRevisions(contactId: string): Promise<ContactRevisionEntity[]> {
    return this.revisions.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    })
  }

  // Create increment: insert a new row (client-generated id) at version 1 and
  // record its first revision snapshot. Editing an existing row is the Update
  // increment, which will add the version check + merge strategy here.
  async pushContact(
    input: ContactInput,
    _expectedVersion: number,
    clientId: string,
  ): Promise<ContactPushResult> {
    return this.dataSource.transaction(async (manager) => {
      const contactRepo = manager.getRepository(ContactEntity)
      const revRepo = manager.getRepository(ContactRevisionEntity)

      // Guard against the TypeORM footgun where findOneBy({ id: undefined })
      // matches the first row instead of nothing.
      const existing = input.id ? await contactRepo.findOneBy({ id: input.id }) : null
      if (existing) {
        // Update is not implemented yet — return current state unchanged.
        return { conflict: false, contact: existing }
      }

      const created = await contactRepo.save(
        contactRepo.create({
          id: input.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          version: 1,
        }),
      )
      await revRepo.save(
        revRepo.create({
          contactId: created.id,
          data: snapshot(created),
          version: 1,
          clientId,
          conflictStatus: ConflictStatus.None,
        }),
      )
      return { conflict: false, contact: created }
    })
  }
}

function snapshot(c: ContactEntity): Record<string, unknown> {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    version: c.version,
  }
}
