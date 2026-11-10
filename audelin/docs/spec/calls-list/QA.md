# Calls list — notes preview QA

The list's state is built directly as a value. What a row shows is proven
by rendering that state against reference images, in light and dark.
Each call with notes has its own notes text, read from a temporary calls
folder. After each user event, the preview the composition derives is
read back: the notes text it carries, or none; whether the panel is shown
is checked through a fake of the panel.

## S-1 The eye marks calls with notes

A state with a call with notes; the image shows the eye just before the
row's action area.

## S-2 Calls without notes keep the eye's place

A state with a call with notes above one without; the image shows the
second with an empty eye place and both rows' columns at the same x.

## S-3 The eye opens the preview

Pressing the eye of a call with notes; the preview carries that call's
notes text, and the fake panel is ordered in.

## S-4 A click moves the preview

With a call previewed, a click on another call with notes; the preview
carries the clicked call's notes text.

## S-5 An arrow key moves the preview

With a call previewed, the down and up arrows each select the next and
previous call; the preview carries the newly selected call's notes text.

## S-6 A call without notes hides the preview

With a call previewed, selecting a call without notes; there is no
preview, and the fake panel is ordered out.

## S-7 The preview comes back with notes

From S-6, selecting a call with notes; the preview carries its notes
text, and the fake panel is ordered in.

## S-8 Notes that finish later

A selected call without notes; its notes are written to the folder, and
the calls window is shown again; the list state has its eye, and pressing
it gives a preview carrying the written notes text.

## S-9 A closed preview stays closed

With the preview closed, selecting another call with notes; there is no
preview, and the fake panel stays out.

## S-10 Closing the calls window

With a call previewed, the calls window closes; there is no preview, and
the fake panel is ordered out.
