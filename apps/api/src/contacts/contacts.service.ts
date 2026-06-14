import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'

// Read-only for increment 1 (Create/Update/Delete come next). Contacts are a
// shared, globally-visible dataset — no per-user scoping, no foreign keys.
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ContactRevisionEntity)
    private readonly revisions: Repository<ContactRevisionEntity>,
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
}
