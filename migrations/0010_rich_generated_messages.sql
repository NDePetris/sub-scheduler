-- Keep the existing text columns as a portable fallback for historical plans
-- while adding the constrained rich representation used by the editor.
ALTER TABLE generated_messages ADD COLUMN generated_html TEXT;
ALTER TABLE generated_messages ADD COLUMN edited_html TEXT;

-- Adopt the teacher-grouped default for installations that still have the
-- original flat-list template. Other configured templates are left intact.
UPDATE application_settings
   SET message_template = 'teacher_grouped_v1'
 WHERE id = 'school'
   AND message_template = '{{school_name}} Sub Plan — {{date}} ({{day_type}} Day)\n\n{{assignments}}';
