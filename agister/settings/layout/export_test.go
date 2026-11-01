package layout

// ReadFolders reads the layer folders given, as Read does once it has
// found them: reading.feature, blocks.feature, names.feature and
// problems.feature specify the reading alone.
func ReadFolders(l *Layout, folders Folders) Snapshot { return l.readFolders(folders) }
