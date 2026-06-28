-- Cover foreign keys used during profile and parent-message maintenance.

create index email_messages_created_by_idx
  on public.email_messages (created_by);

create index email_messages_parent_message_id_idx
  on public.email_messages (parent_message_id)
  where parent_message_id is not null;
